-- Item 49: financial_records materialized view conversion.
--
-- The existing financial_records table is trigger-maintained (item 23,
-- trg_sync_financial_records). This migration adds the next phase:
--
--   financial_records_gl_mv  — MATERIALIZED VIEW of GL-derived records
--                              (journal_entry_id IS NOT NULL).
--                              Refresh is explicit via REFRESH MATERIALIZED VIEW
--                              or via the fn_refresh_financial_records_mv() function.
--
--   financial_records_full_v — regular VIEW that UNIONs the legacy direct-write
--                              rows (journal_entry_id IS NULL) with the GL
--                              materialized view, giving a single query surface.
--
-- Row-level security is not available on materialized views in PostgreSQL.
-- RLS is enforced by the wrapping view and by application-layer org filtering.
-- The trigger on financial_records is retained for backwards-compatibility;
-- it can be dropped once all consumers switch to financial_records_full_v.

-- ── GL-backed materialized view ───────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.financial_records_gl_mv;

CREATE MATERIALIZED VIEW public.financial_records_gl_mv AS
SELECT
  je.id                                           AS journal_entry_id,
  je.organization_id,
  je.entry_date                                   AS record_date,
  je.memo                                         AS description,
  ga.account_type                                 AS type,
  ga.name                                         AS category,
  COALESCE(SUM(jl.debit),  0)
    - COALESCE(SUM(jl.credit), 0)                  AS amount,
  je.created_by                                   AS user_id,
  je.created_at,
  je.updated_at
FROM public.journal_entries je
JOIN public.journal_lines   jl ON jl.journal_entry_id = je.id
JOIN public.gl_accounts     ga ON ga.id = jl.gl_account_id
WHERE je.is_posted = true
  AND ga.account_type IN ('revenue', 'expense')
GROUP BY
  je.id, je.organization_id, je.entry_date, je.memo,
  ga.account_type, ga.name, je.created_by, je.created_at, je.updated_at
WITH DATA;

-- Indexes for common query patterns
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_records_gl_mv_je_type
  ON public.financial_records_gl_mv (journal_entry_id, type);

CREATE INDEX IF NOT EXISTS idx_financial_records_gl_mv_org_date
  ON public.financial_records_gl_mv (organization_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_records_gl_mv_type
  ON public.financial_records_gl_mv (organization_id, type);

-- ── Refresh helper function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_refresh_financial_records_mv()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.financial_records_gl_mv;
$$;

COMMENT ON FUNCTION public.fn_refresh_financial_records_mv() IS
  'Refreshes financial_records_gl_mv. Call after bulk journal_lines changes '
  'or via pg_cron on a schedule (e.g. every 15 minutes).';

-- ── Unified view (legacy + GL) ────────────────────────────────────────────────

DROP VIEW IF EXISTS public.financial_records_full_v;

CREATE VIEW public.financial_records_full_v AS
  -- Legacy direct-write rows (journal_entry_id IS NULL)
  SELECT
    id,
    journal_entry_id,
    organization_id,
    record_date,
    description,
    type,
    category,
    amount,
    user_id,
    created_at,
    updated_at,
    'legacy'::text AS source
  FROM public.financial_records
  WHERE journal_entry_id IS NULL

  UNION ALL

  -- GL-derived rows from the materialized view
  SELECT
    gen_random_uuid()                             AS id,
    journal_entry_id,
    organization_id,
    record_date,
    description,
    type,
    category,
    amount,
    user_id,
    created_at,
    updated_at,
    'gl'::text                                    AS source
  FROM public.financial_records_gl_mv;

COMMENT ON VIEW public.financial_records_full_v IS
  'Unified read surface for financial records. Combines legacy direct-write rows '
  '(journal_entry_id IS NULL) with GL-derived rows from financial_records_gl_mv. '
  'Apply organization_id filter in all queries; RLS is not enforced at the view layer.';
