-- Replaces the N+1 round-trip loop in the migrate-legacy-payroll Edge Function.
--
-- Problems fixed:
--   1. 1000-row default cap: Supabase JS .select() without .limit() returns at most
--      1000 rows; large orgs would silently migrate only a slice.
--   2. Atomicity: is_superseded update had no error handling; a crash mid-loop left
--      orphaned payroll_runs with no corresponding legacy record cleanup.
--   3. N+1 latency: 3 DB round-trips per employee (run INSERT, entry INSERT, record
--      UPDATE) across a network hop per iteration — 500 records ≈ 1 500 calls,
--      likely exceeding the 150 s Edge Function hard limit.
--
-- The RPC processes everything inside the database in a single call.  Per-record
-- errors are caught and reported without aborting the rest of the batch.

CREATE OR REPLACE FUNCTION public.migrate_legacy_payroll_to_engine(
  p_org_id  UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec        RECORD;
  v_run_id     UUID;
  v_gross      NUMERIC;
  v_total_ded  NUMERIC;
  v_earnings   JSONB;
  v_deductions JSONB;
  v_migrated   INT := 0;
  v_skipped    INT := 0;
  v_errors     TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rec IN
    SELECT id, profile_id, organization_id, pay_period,
           basic_salary, hra, transport_allowance, other_allowances,
           pf_deduction, tax_deduction, other_deductions,
           lop_days, lop_deduction, working_days, paid_days,
           net_pay, status
    FROM   public.payroll_records
    WHERE  is_superseded = false
      AND  organization_id IS NOT NULL
      AND  (p_org_id IS NULL OR organization_id = p_org_id)
    ORDER  BY pay_period, profile_id
  LOOP
    v_run_id := NULL;

    -- Skip if a matching engine entry already exists for this profile + period.
    IF EXISTS (
      SELECT 1
      FROM   public.payroll_entries pe
      JOIN   public.payroll_runs    pr ON pr.id = pe.payroll_run_id
      WHERE  pe.profile_id = v_rec.profile_id
        AND  pr.pay_period = v_rec.pay_period
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_gross := COALESCE(v_rec.basic_salary,         0)
               + COALESCE(v_rec.hra,                   0)
               + COALESCE(v_rec.transport_allowance,   0)
               + COALESCE(v_rec.other_allowances,      0);

      v_total_ded := COALESCE(v_rec.pf_deduction,    0)
                   + COALESCE(v_rec.tax_deduction,    0)
                   + COALESCE(v_rec.other_deductions, 0)
                   + COALESCE(v_rec.lop_deduction,    0);

      -- Build earnings breakdown; omit zero-value components.
      v_earnings := '[]'::JSONB;
      IF COALESCE(v_rec.basic_salary, 0) > 0 THEN
        v_earnings := v_earnings || jsonb_build_array(
          jsonb_build_object('name', 'Basic Salary', 'monthly', v_rec.basic_salary));
      END IF;
      IF COALESCE(v_rec.hra, 0) > 0 THEN
        v_earnings := v_earnings || jsonb_build_array(
          jsonb_build_object('name', 'HRA', 'monthly', v_rec.hra));
      END IF;
      IF COALESCE(v_rec.transport_allowance, 0) > 0 THEN
        v_earnings := v_earnings || jsonb_build_array(
          jsonb_build_object('name', 'Incentives', 'monthly', v_rec.transport_allowance));
      END IF;
      IF COALESCE(v_rec.other_allowances, 0) > 0 THEN
        v_earnings := v_earnings || jsonb_build_array(
          jsonb_build_object('name', 'Other Allowances', 'monthly', v_rec.other_allowances));
      END IF;

      -- Build deductions breakdown; omit zero-value components.
      v_deductions := '[]'::JSONB;
      IF COALESCE(v_rec.pf_deduction, 0) > 0 THEN
        v_deductions := v_deductions || jsonb_build_array(
          jsonb_build_object('name', 'PF Contribution', 'monthly', v_rec.pf_deduction));
      END IF;
      IF COALESCE(v_rec.tax_deduction, 0) > 0 THEN
        v_deductions := v_deductions || jsonb_build_array(
          jsonb_build_object('name', 'TDS', 'monthly', v_rec.tax_deduction));
      END IF;
      IF COALESCE(v_rec.other_deductions, 0) + COALESCE(v_rec.lop_deduction, 0) > 0 THEN
        v_deductions := v_deductions || jsonb_build_array(
          jsonb_build_object('name', 'Other Deductions', 'monthly',
            COALESCE(v_rec.other_deductions, 0) + COALESCE(v_rec.lop_deduction, 0)));
      END IF;

      -- Synthetic payroll_run for this org + period.
      INSERT INTO public.payroll_runs (
        organization_id, pay_period, generated_by, status,
        employee_count, total_gross, total_deductions, total_net, notes
      ) VALUES (
        v_rec.organization_id,
        v_rec.pay_period,
        p_user_id,
        CASE WHEN v_rec.status = 'locked' THEN 'locked' ELSE 'draft' END,
        1,
        v_gross,
        v_total_ded,
        COALESCE(v_rec.net_pay, 0),
        'Migrated from legacy payroll_records'
      )
      RETURNING id INTO v_run_id;

      -- Engine entry mirroring the legacy record.
      -- annual_ctc = monthly_gross × 12 (approximation; legacy records carry no CTC).
      INSERT INTO public.payroll_entries (
        payroll_run_id, profile_id, organization_id,
        gross_earnings, total_deductions, net_pay,
        annual_ctc,
        lwp_days, lwp_deduction, working_days, paid_days,
        earnings_breakdown, deductions_breakdown,
        pf_employee, tds_amount,
        status
      ) VALUES (
        v_run_id,
        v_rec.profile_id,
        v_rec.organization_id,
        v_gross,
        v_total_ded,
        COALESCE(v_rec.net_pay, 0),
        v_gross * 12,
        COALESCE(v_rec.lop_days,        0),
        COALESCE(v_rec.lop_deduction,   0),
        COALESCE(v_rec.working_days,    0),
        COALESCE(v_rec.paid_days,       0),
        v_earnings,
        v_deductions,
        COALESCE(v_rec.pf_deduction,  0),
        COALESCE(v_rec.tax_deduction, 0),
        'computed'
      );

      -- Mark source record superseded now that engine entry exists.
      UPDATE public.payroll_records
      SET    is_superseded = true,
             status        = 'superseded'
      WHERE  id = v_rec.id;

      v_migrated := v_migrated + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, format('[%s] %s', v_rec.id, SQLERRM));
      -- Roll back any run we created for this record so it doesn't become an orphan.
      IF v_run_id IS NOT NULL THEN
        DELETE FROM public.payroll_runs WHERE id = v_run_id;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'migrated', v_migrated,
    'skipped',  v_skipped,
    'errors',   to_jsonb(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_legacy_payroll_to_engine TO authenticated;

COMMENT ON FUNCTION public.migrate_legacy_payroll_to_engine IS
  'One-shot migration: copies non-superseded payroll_records into payroll_runs + payroll_entries. '
  'Idempotent — skips records where a matching engine entry already exists for the same '
  'profile_id + pay_period. annual_ctc = monthly_gross × 12 (approximation for legacy records '
  'that do not carry CTC data). Per-record errors are captured and returned without aborting '
  'the rest of the batch.';
