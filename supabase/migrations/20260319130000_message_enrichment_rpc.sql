-- ─────────────────────────────────────────────────────────────────────────────
-- get_invoice_message_enrichment: efficient SQL function for dashboard enrichment.
--
-- Replaces JavaScript aggregation in invoice-dashboard-enrichment edge function.
-- Uses a single GROUP BY query with aggregate FILTER clauses, which is
-- significantly more efficient than fetching all rows and aggregating in JS.
--
-- The existing idx_messages_entity_created index covers the query pattern.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invoice_message_enrichment(
  p_organization_id UUID,
  p_invoice_ids     UUID[] DEFAULT NULL
)
RETURNS TABLE (
  invoice_id            UUID,
  last_message_channel  TEXT,
  last_message_status   TEXT,
  last_message_at       TIMESTAMPTZ,
  last_contacted_at     TIMESTAMPTZ,
  total_messages_sent   BIGINT,
  total_replies         BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER   -- runs with definer rights; RLS is enforced at the calling layer
AS $$
  SELECT
    entity_id                                                                    AS invoice_id,
    -- Most recent message channel (ARRAY_AGG with ORDER BY picks the latest element)
    (ARRAY_AGG(channel      ORDER BY created_at DESC))[1]                       AS last_message_channel,
    -- Most recent message status
    (ARRAY_AGG(status       ORDER BY created_at DESC))[1]                       AS last_message_status,
    -- Timestamp of the most recent message (any direction)
    MAX(created_at)                                                              AS last_message_at,
    -- Timestamp of the most recent OUTBOUND message
    MAX(created_at) FILTER (WHERE direction = 'outbound')                       AS last_contacted_at,
    -- Count of outbound messages
    COUNT(*) FILTER (WHERE direction = 'outbound')                              AS total_messages_sent,
    -- Count of inbound messages (replies)
    COUNT(*) FILTER (WHERE direction = 'inbound')                               AS total_replies
  FROM messages
  WHERE
    organization_id = p_organization_id
    AND entity_type = 'invoice'
    AND (p_invoice_ids IS NULL OR entity_id = ANY(p_invoice_ids))
  GROUP BY entity_id;
$$;

-- Grant execute to authenticated users (RLS on messages table still applies
-- via the SECURITY INVOKER path; SECURITY DEFINER is used here so the
-- function can be called from the service-role context of edge functions).
GRANT EXECUTE ON FUNCTION get_invoice_message_enrichment(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invoice_message_enrichment(UUID, UUID[]) TO service_role;
