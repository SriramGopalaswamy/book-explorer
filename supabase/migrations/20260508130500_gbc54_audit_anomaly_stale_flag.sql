-- ══════════════════════════════════════════════════════════════════════
-- GBC-54 — CA Audit Console anomaly staleness flag
--
-- audit_ai_anomalies are produced by a snapshot run (per
-- audit_compliance_runs). When a CA fixes the underlying transaction
-- (e.g. corrects an invoice that triggered a "round_figure" flag), the
-- anomaly row keeps showing the old condition until a full re-run.
--
-- This migration adds `is_stale` + `stale_reason` to audit_ai_anomalies,
-- and wires triggers on the source tables (invoices, bills,
-- journal_lines, expenses) to flip the flag when a row referenced by
-- the anomaly's `data_reference` jsonb is mutated.
--
-- The UI surfaces the flag as a per-row badge plus a "Re-validate this
-- row" action that re-runs only the relevant audit check against the
-- updated source data (a future RPC), then clears the flag.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.audit_ai_anomalies
  ADD COLUMN IF NOT EXISTS is_stale       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_reason   text,
  ADD COLUMN IF NOT EXISTS stale_marked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_audit_anomalies_stale
  ON public.audit_ai_anomalies (organization_id, is_stale)
  WHERE is_stale = true;

-- Helper: mark every NON-stale anomaly whose data_reference points at
-- the supplied (entity_type, entity_id) as stale.
CREATE OR REPLACE FUNCTION public.fn_mark_audit_anomalies_stale(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.audit_ai_anomalies
     SET is_stale = true,
         stale_reason = format(
           'Source %s row %s mutated after the audit run.', p_entity_type, p_entity_id::text),
         stale_marked_at = now()
   WHERE is_stale = false
     AND data_reference @> jsonb_build_object('entity_type', p_entity_type)
     AND data_reference @> jsonb_build_object('entity_id', p_entity_id::text);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Trigger function that fires AFTER UPDATE/DELETE on source rows and
-- flips the stale flag. TG_TABLE_NAME maps directly to the
-- data_reference.entity_type used by the AI auditor (invoices, bills,
-- journal_lines, expenses, etc.).
CREATE OR REPLACE FUNCTION public.trg_audit_anomalies_invalidate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := COALESCE((CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END));
  PERFORM public.fn_mark_audit_anomalies_stale(TG_TABLE_NAME::text, v_id);
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Attach to the source tables the AI auditor inspects today.
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','bills','journal_lines','journal_entries','expenses'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_anomalies_invalidate_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_anomalies_invalidate_%I
           AFTER UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.trg_audit_anomalies_invalidate()',
        t, t
      );
    END IF;
  END LOOP;
END
$do$;

-- "Re-validate this row" action: clears the stale flag once the CA has
-- visually confirmed the anomaly no longer applies. Does NOT re-run the
-- AI audit; that's the broader compliance run.
CREATE OR REPLACE FUNCTION public.clear_audit_anomaly_stale(
  p_anomaly_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_anom_org uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  SELECT organization_id INTO v_anom_org
    FROM public.audit_ai_anomalies WHERE id = p_anomaly_id;
  IF v_anom_org IS NULL THEN
    RAISE EXCEPTION 'Anomaly % not found', p_anomaly_id;
  END IF;
  IF v_anom_org <> v_org THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;
  UPDATE public.audit_ai_anomalies
     SET is_stale = false,
         stale_reason = NULL,
         stale_marked_at = NULL
   WHERE id = p_anomaly_id;
  RETURN p_anomaly_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_audit_anomaly_stale(uuid) TO authenticated;
