-- ─────────────────────────────────────────────────────────────────────────────
-- messages: channel-agnostic outbound & inbound message log
--
-- This table is the single source of truth for ALL messages sent or received
-- across any channel (email, whatsapp, sms, etc.). It sits alongside the
-- existing email_logs table (which is NOT modified) to ensure zero regression.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The entity this message is about (e.g. "invoice")
  entity_type   TEXT        NOT NULL,
  entity_id     UUID        NOT NULL,
  -- Channel the message was sent/received on
  channel       TEXT        NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'internal')),
  -- Direction from the perspective of the platform
  direction     TEXT        NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  -- Recipient address (email address, phone number, etc.)
  recipient     TEXT,
  -- Sender address (for inbound)
  sender        TEXT,
  -- Subject line (nullable — not all channels have subjects)
  subject       TEXT,
  -- Plain-text content of the message
  content       TEXT,
  -- Template identifier used (for outbound, optional)
  template      TEXT,
  -- Delivery status
  status        TEXT        NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'pending')),
  -- External provider message ID (e.g. MS Graph message ID)
  external_id   TEXT,
  -- Thread/conversation ID for grouping replies
  thread_id     TEXT,
  -- Organization context
  organization_id UUID      REFERENCES organizations(id) ON DELETE CASCADE,
  -- Classification for inbound messages (mirrors email_logs.classification)
  classification TEXT       CHECK (classification IN ('acknowledged', 'dispute', 'other')),
  -- Raw metadata/payload from the provider
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Fast lookup by entity (e.g. "all messages for invoice X")
CREATE INDEX IF NOT EXISTS idx_messages_entity
  ON messages (entity_type, entity_id);

-- Fast lookup by org + created_at for dashboard queries
CREATE INDEX IF NOT EXISTS idx_messages_org_created
  ON messages (organization_id, created_at DESC);

-- Fast lookup by thread for conversation grouping
CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages (thread_id)
  WHERE thread_id IS NOT NULL;

-- Fast lookup of last message per entity (used by condition engine)
CREATE INDEX IF NOT EXISTS idx_messages_entity_created
  ON messages (entity_type, entity_id, created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Reuse the same helper that email_logs / workflow tables use
CREATE POLICY "Finance and admin can view messages"
  ON messages FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('finance', 'admin', 'owner', 'hr', 'manager')
    )
  );

CREATE POLICY "Finance and admin can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('finance', 'admin', 'owner')
    )
  );

-- Service role (edge functions) bypasses RLS automatically — no extra policy needed.

-- ─── Convenience view: last message per entity ────────────────────────────────
-- Used by the dashboard enrichment query and condition engine.

CREATE OR REPLACE VIEW last_messages AS
SELECT DISTINCT ON (entity_type, entity_id)
  id,
  entity_type,
  entity_id,
  channel,
  direction,
  recipient,
  sender,
  subject,
  status,
  classification,
  created_at
FROM messages
ORDER BY entity_type, entity_id, created_at DESC;
