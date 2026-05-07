-- GBC-6 remediation: pin search_path on remaining post-cutoff SECURITY DEFINER functions.

-- The messages table was dropped in a later migration; this function is dead code.
DROP FUNCTION IF EXISTS public.get_invoice_message_enrichment(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.claim_workflow_runs(
  p_now         TIMESTAMPTZ,
  p_claim_until TIMESTAMPTZ,
  p_limit       INT DEFAULT 50
)
RETURNS SETOF public.workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.workflow_runs
  SET next_run_at = p_claim_until,
      updated_at  = NOW()
  WHERE id IN (
    SELECT id FROM public.workflow_runs
    WHERE status = 'running'
      AND next_run_at <= p_now
    ORDER BY next_run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_workflow_runs(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;