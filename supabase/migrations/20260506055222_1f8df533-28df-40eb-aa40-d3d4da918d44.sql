CREATE TABLE IF NOT EXISTS public.payroll_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  event_type TEXT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id),
  payroll_run_id UUID REFERENCES public.payroll_runs(id),
  entry_id UUID REFERENCES public.payroll_entries(id),
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT, before_state JSONB, after_state JSONB, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_events_org ON public.payroll_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_events_run ON public.payroll_events(payroll_run_id) WHERE payroll_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_events_entry ON public.payroll_events(entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_events_employee ON public.payroll_events(employee_id) WHERE employee_id IS NOT NULL;
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can read payroll events" ON public.payroll_events;
CREATE POLICY "Org members can read payroll events" ON public.payroll_events FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Authenticated can insert payroll events" ON public.payroll_events;
CREATE POLICY "Authenticated can insert payroll events" ON public.payroll_events FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can create own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete own draft expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view own payroll" ON public.payroll_records;
DROP POLICY IF EXISTS "Users can create own reimbursements" ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Users can view own reimbursements" ON public.reimbursement_requests;

DROP TRIGGER IF EXISTS trg_expense_profile_id ON public.expenses;
DROP FUNCTION IF EXISTS public.auto_set_expense_profile_id();
ALTER TABLE public.attendance_records DROP COLUMN IF EXISTS user_id CASCADE;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS user_id CASCADE;
ALTER TABLE public.payroll_records DROP COLUMN IF EXISTS user_id CASCADE;
ALTER TABLE public.reimbursement_requests DROP COLUMN IF EXISTS user_id CASCADE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bills' AND column_name='is_deleted') THEN
    EXECUTE 'DELETE FROM public.bills WHERE is_deleted = true'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='is_deleted') THEN
    EXECUTE 'DELETE FROM public.invoices WHERE is_deleted = true'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='is_deleted') THEN
    EXECUTE 'DELETE FROM public.expenses WHERE is_deleted = true'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='financial_records' AND column_name='is_deleted') THEN
    EXECUTE 'ALTER TABLE public.financial_records DISABLE TRIGGER USER';
    EXECUTE 'DELETE FROM public.financial_records WHERE is_deleted = true';
    EXECUTE 'ALTER TABLE public.financial_records ENABLE TRIGGER USER'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='is_deleted') THEN
    EXECUTE 'ALTER TABLE public.journal_entries DISABLE TRIGGER USER';
    EXECUTE 'DELETE FROM public.journal_entries WHERE is_deleted = true';
    EXECUTE 'ALTER TABLE public.journal_entries ENABLE TRIGGER USER'; END IF;
END $$;
ALTER TABLE public.bills DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.financial_records DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS is_deleted, DROP COLUMN IF EXISTS deleted_at;

COMMENT ON TABLE public.payroll_records IS 'DEPRECATED (item 46): writes go to payroll_runs + payroll_entries.';
DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payroll_records' AND cmd='INSERT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.payroll_records', pol.policyname); END LOOP;
END $$;

DROP MATERIALIZED VIEW IF EXISTS public.financial_records_gl_mv;
CREATE MATERIALIZED VIEW public.financial_records_gl_mv AS
SELECT je.id AS journal_entry_id, je.organization_id, je.entry_date AS record_date, je.memo AS description,
  ga.account_type AS type, ga.name AS category,
  COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS amount,
  je.created_by AS user_id, je.created_at, je.created_at AS updated_at
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.gl_accounts ga ON ga.id = jl.gl_account_id
WHERE je.is_posted = true AND ga.account_type IN ('revenue','expense')
GROUP BY je.id, je.organization_id, je.entry_date, je.memo, ga.account_type, ga.name, je.created_by, je.created_at
WITH DATA;
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_records_gl_mv_je_type ON public.financial_records_gl_mv (journal_entry_id, type);
CREATE INDEX IF NOT EXISTS idx_financial_records_gl_mv_org_date ON public.financial_records_gl_mv (organization_id, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_records_gl_mv_type ON public.financial_records_gl_mv (organization_id, type);
CREATE OR REPLACE FUNCTION public.fn_refresh_financial_records_mv()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.financial_records_gl_mv;
$$;
DROP VIEW IF EXISTS public.financial_records_full_v;
CREATE VIEW public.financial_records_full_v AS
  SELECT id, journal_entry_id, organization_id, record_date, description, type, category, amount, user_id, created_at, updated_at, 'legacy'::text AS source
  FROM public.financial_records WHERE journal_entry_id IS NULL
  UNION ALL
  SELECT gen_random_uuid() AS id, journal_entry_id, organization_id, record_date, description, type, category, amount, user_id, created_at, updated_at, 'gl'::text AS source
  FROM public.financial_records_gl_mv;

DROP POLICY IF EXISTS "Org members can insert payroll records" ON public.payroll_records;

CREATE OR REPLACE FUNCTION public.process_payroll_entries_batch(p_payroll_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_engine_processed INT := 0; v_legacy_processed INT := 0; v_skipped INT := 0;
  v_caller_org UUID; v_cross_org_engine INT; v_cross_org_legacy INT;
BEGIN
  SELECT organization_id INTO v_caller_org FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_caller_org IS NULL THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF array_length(p_payroll_ids,1) IS NULL THEN
    RETURN jsonb_build_object('processed',0,'engine_processed',0,'legacy_processed',0,'skipped',0,'total',0); END IF;
  SELECT COUNT(*) INTO v_cross_org_engine FROM public.payroll_entries WHERE id = ANY(p_payroll_ids) AND organization_id != v_caller_org;
  IF v_cross_org_engine>0 THEN RAISE EXCEPTION 'Cannot process payroll records from another organization.'; END IF;
  SELECT COUNT(*) INTO v_cross_org_legacy FROM public.payroll_records WHERE id = ANY(p_payroll_ids) AND organization_id != v_caller_org;
  IF v_cross_org_legacy>0 THEN RAISE EXCEPTION 'Cannot process payroll records from another organization.'; END IF;
  WITH updated AS (UPDATE public.payroll_entries SET status='processed', updated_at=NOW()
    WHERE id = ANY(p_payroll_ids) AND organization_id = v_caller_org AND status IN ('computed','draft','pending') RETURNING id)
    SELECT COUNT(*) INTO v_engine_processed FROM updated;
  WITH updated AS (UPDATE public.payroll_records SET status='processed', updated_at=NOW()
    WHERE id = ANY(p_payroll_ids) AND organization_id = v_caller_org AND status IN ('draft','pending') RETURNING id)
    SELECT COUNT(*) INTO v_legacy_processed FROM updated;
  v_skipped := array_length(p_payroll_ids,1) - v_engine_processed - v_legacy_processed;
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_values)
  SELECT v_caller_org, auth.uid(), 'process_payroll_batch', 'payroll', unnest(p_payroll_ids),
    jsonb_build_object('status','processed','source','process_payroll_entries_batch')
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('processed',v_engine_processed+v_legacy_processed,'engine_processed',v_engine_processed,'legacy_processed',v_legacy_processed,'skipped',v_skipped,'total',array_length(p_payroll_ids,1));
END; $$;
GRANT EXECUTE ON FUNCTION public.process_payroll_entries_batch TO authenticated;

CREATE OR REPLACE FUNCTION public.migrate_legacy_payroll_to_engine(p_org_id UUID DEFAULT NULL, p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec RECORD; v_run_id UUID; v_gross NUMERIC; v_total_ded NUMERIC;
  v_earnings JSONB; v_deductions JSONB;
  v_migrated INT := 0; v_skipped INT := 0; v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rec IN
    SELECT id, profile_id, organization_id, pay_period, basic_salary, hra, transport_allowance, other_allowances,
           pf_deduction, tax_deduction, other_deductions, lop_days, lop_deduction, working_days, paid_days, net_pay, status
    FROM public.payroll_records
    WHERE is_superseded = false AND organization_id IS NOT NULL AND (p_org_id IS NULL OR organization_id = p_org_id)
    ORDER BY pay_period, profile_id
  LOOP
    v_run_id := NULL;
    IF EXISTS (SELECT 1 FROM public.payroll_entries pe JOIN public.payroll_runs pr ON pr.id = pe.payroll_run_id
               WHERE pe.profile_id = v_rec.profile_id AND pr.pay_period = v_rec.pay_period) THEN
      v_skipped := v_skipped + 1; CONTINUE; END IF;
    BEGIN
      v_gross := COALESCE(v_rec.basic_salary,0)+COALESCE(v_rec.hra,0)+COALESCE(v_rec.transport_allowance,0)+COALESCE(v_rec.other_allowances,0);
      v_total_ded := COALESCE(v_rec.pf_deduction,0)+COALESCE(v_rec.tax_deduction,0)+COALESCE(v_rec.other_deductions,0)+COALESCE(v_rec.lop_deduction,0);
      v_earnings := '[]'::JSONB;
      IF COALESCE(v_rec.basic_salary,0)>0 THEN v_earnings := v_earnings || jsonb_build_array(jsonb_build_object('name','Basic Salary','monthly',v_rec.basic_salary)); END IF;
      IF COALESCE(v_rec.hra,0)>0 THEN v_earnings := v_earnings || jsonb_build_array(jsonb_build_object('name','HRA','monthly',v_rec.hra)); END IF;
      IF COALESCE(v_rec.transport_allowance,0)>0 THEN v_earnings := v_earnings || jsonb_build_array(jsonb_build_object('name','Incentives','monthly',v_rec.transport_allowance)); END IF;
      IF COALESCE(v_rec.other_allowances,0)>0 THEN v_earnings := v_earnings || jsonb_build_array(jsonb_build_object('name','Other Allowances','monthly',v_rec.other_allowances)); END IF;
      v_deductions := '[]'::JSONB;
      IF COALESCE(v_rec.pf_deduction,0)>0 THEN v_deductions := v_deductions || jsonb_build_array(jsonb_build_object('name','PF Contribution','monthly',v_rec.pf_deduction)); END IF;
      IF COALESCE(v_rec.tax_deduction,0)>0 THEN v_deductions := v_deductions || jsonb_build_array(jsonb_build_object('name','TDS','monthly',v_rec.tax_deduction)); END IF;
      IF COALESCE(v_rec.other_deductions,0)+COALESCE(v_rec.lop_deduction,0)>0 THEN
        v_deductions := v_deductions || jsonb_build_array(jsonb_build_object('name','Other Deductions','monthly', COALESCE(v_rec.other_deductions,0)+COALESCE(v_rec.lop_deduction,0))); END IF;
      INSERT INTO public.payroll_runs (organization_id, pay_period, generated_by, status, employee_count, total_gross, total_deductions, total_net, notes)
      VALUES (v_rec.organization_id, v_rec.pay_period, p_user_id,
        CASE WHEN v_rec.status='locked' THEN 'locked' ELSE 'draft' END, 1, v_gross, v_total_ded, COALESCE(v_rec.net_pay,0), 'Migrated from legacy payroll_records')
      RETURNING id INTO v_run_id;
      INSERT INTO public.payroll_entries (payroll_run_id, profile_id, organization_id, gross_earnings, total_deductions, net_pay, annual_ctc,
        lwp_days, lwp_deduction, working_days, paid_days, earnings_breakdown, deductions_breakdown, pf_employee, tds_amount, status)
      VALUES (v_run_id, v_rec.profile_id, v_rec.organization_id, v_gross, v_total_ded, COALESCE(v_rec.net_pay,0), v_gross*12,
        COALESCE(v_rec.lop_days,0), COALESCE(v_rec.lop_deduction,0), COALESCE(v_rec.working_days,0), COALESCE(v_rec.paid_days,0),
        v_earnings, v_deductions, COALESCE(v_rec.pf_deduction,0), COALESCE(v_rec.tax_deduction,0), 'computed');
      UPDATE public.payroll_records SET is_superseded=true, status='superseded' WHERE id = v_rec.id;
      v_migrated := v_migrated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, format('[%s] %s', v_rec.id, SQLERRM));
      IF v_run_id IS NOT NULL THEN DELETE FROM public.payroll_runs WHERE id = v_run_id; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('migrated',v_migrated,'skipped',v_skipped,'errors',to_jsonb(v_errors));
END; $$;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_payroll_to_engine TO authenticated;
