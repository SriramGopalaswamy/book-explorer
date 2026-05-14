
-- 1. Replace strict unique constraint with partial index allowing retry after failed/cancelled
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_organization_id_pay_period_key;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_org_period_active_uidx
ON public.payroll_runs (organization_id, pay_period)
WHERE status NOT IN ('failed', 'cancelled');

-- 2. start_payroll_run RPC: atomic claim
CREATE OR REPLACE FUNCTION public.start_payroll_run(
  org_id uuid,
  p_pay_period text,
  initiated_by uuid
)
RETURNS TABLE(status text, payroll_run_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  existing_status text;
  new_id uuid;
  period_year int;
  period_month int;
  period_first_day date;
BEGIN
  -- Validate format & not in future (pay_period is YYYY-MM[-H1|-H2|-W#])
  IF p_pay_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])(-(H[12]|W[1-5]))?$' THEN
    RETURN QUERY SELECT 'invalid_period'::text, NULL::uuid;
    RETURN;
  END IF;

  period_year := substring(p_pay_period from 1 for 4)::int;
  period_month := substring(p_pay_period from 6 for 2)::int;
  period_first_day := make_date(period_year, period_month, 1);

  IF period_first_day > date_trunc('month', CURRENT_DATE)::date THEN
    RETURN QUERY SELECT 'future_period'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Authorization: caller must be HR/Finance/Admin for this org
  IF NOT (
    public.is_org_admin_or_hr(initiated_by, org_id)
    OR public.is_org_admin_or_finance(initiated_by, org_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised to start payroll run for this organization';
  END IF;

  -- Lock the org+period row(s) to prevent race
  PERFORM 1
  FROM public.payroll_runs
  WHERE organization_id = org_id
    AND pay_period = p_pay_period
    AND status NOT IN ('failed', 'cancelled')
  FOR UPDATE;

  SELECT id, pr.status
    INTO existing_id, existing_status
  FROM public.payroll_runs pr
  WHERE pr.organization_id = org_id
    AND pr.pay_period = p_pay_period
    AND pr.status NOT IN ('failed', 'cancelled')
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    IF existing_status IN ('completed', 'under_review', 'approved', 'locked') THEN
      RETURN QUERY SELECT 'already_completed'::text, existing_id;
    ELSE
      RETURN QUERY SELECT 'already_processing'::text, existing_id;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.payroll_runs (organization_id, pay_period, status, generated_by)
  VALUES (org_id, p_pay_period, 'processing', initiated_by)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT 'started'::text, new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_payroll_run(uuid, text, uuid) TO authenticated;

-- 3. Trigger: recompute payroll_entries totals server-side using NUMERIC
CREATE OR REPLACE FUNCTION public.recalc_payroll_entry_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_gross numeric := 0;
  v_ded numeric := 0;
BEGIN
  IF NEW.earnings_breakdown IS NOT NULL AND jsonb_typeof(NEW.earnings_breakdown) = 'array' THEN
    SELECT COALESCE(SUM((elem->>'monthly')::numeric), 0)
      INTO v_gross
    FROM jsonb_array_elements(NEW.earnings_breakdown) AS elem
    WHERE (elem->>'monthly') IS NOT NULL;
  END IF;

  IF NEW.deductions_breakdown IS NOT NULL AND jsonb_typeof(NEW.deductions_breakdown) = 'array' THEN
    SELECT COALESCE(SUM((elem->>'monthly')::numeric), 0)
      INTO v_ded
    FROM jsonb_array_elements(NEW.deductions_breakdown) AS elem
    WHERE (elem->>'monthly') IS NOT NULL;
  END IF;

  -- Add LWP deduction (stored separately from breakdown)
  v_ded := v_ded + COALESCE(NEW.lwp_deduction, 0);

  NEW.gross_earnings := v_gross;
  NEW.total_deductions := v_ded;
  NEW.net_pay := v_gross - v_ded;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_payroll_entry_totals ON public.payroll_entries;
CREATE TRIGGER trg_recalc_payroll_entry_totals
BEFORE INSERT OR UPDATE OF earnings_breakdown, deductions_breakdown, lwp_deduction
ON public.payroll_entries
FOR EACH ROW
EXECUTE FUNCTION public.recalc_payroll_entry_totals();

-- 4. Realtime: enable for payroll_runs (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payroll_runs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll_runs';
  END IF;
END$$;

ALTER TABLE public.payroll_runs REPLICA IDENTITY FULL;
