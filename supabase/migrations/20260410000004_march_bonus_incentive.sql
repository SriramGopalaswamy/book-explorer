-- ═══════════════════════════════════════════════════════════════════════
-- March 2026 — Bonus & Incentive additions
--
-- Adds one-time Bonus/Incentive amounts to specific employees' payroll
-- entries for the March 2026 run.  Must be applied AFTER payroll is
-- generated (run status = 'completed') and BEFORE it is locked.
--
-- Bonus  (3 employees): Arvind, Omkar, Deepanshu
-- Incentive (4 employees): Yashwanth, Manohar, Jayasankar, Madhusudhan
-- Shruthi's ₹16,200 incentive is ON HOLD — not included.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c_org_id  UUID := '00000000-0000-0000-0000-000000000001';
  v_run_id  UUID;
  v_run_status TEXT;
  v_entry_id UUID;
  emp RECORD;
BEGIN
  -- ── Locate March 2026 run ──────────────────────────────────────────
  SELECT id, status INTO v_run_id, v_run_status
  FROM public.payroll_runs
  WHERE organization_id = c_org_id AND pay_period = '2026-03'
  LIMIT 1;

  IF v_run_id IS NULL THEN
    RAISE EXCEPTION 'March 2026 payroll run not found. Generate payroll first, then apply this migration.';
  END IF;

  IF v_run_status = 'locked' THEN
    RAISE EXCEPTION 'March 2026 run is already locked. Unlock it before applying bonus/incentive.';
  END IF;

  -- ── Apply per-employee amounts ─────────────────────────────────────
  FOR emp IN (
    SELECT t.email, t.component_name, t.amount
    FROM (VALUES
      ('arvind@grx10.com',     'Bonus',     4612.84),
      ('omkar@grx10.com',      'Bonus',     2599.00),
      ('deepanshu@grx10.com',  'Bonus',     5000.00),
      ('yashwanth@grx10.com',  'Incentive', 5400.00),
      ('manohar@grx10.com',    'Incentive', 5400.00),
      ('jayasankar@grx10.com', 'Incentive', 5100.00),
      ('madhu@grx10.com',      'Incentive', 5700.00)
    ) AS t(email, component_name, amount)
  ) LOOP

    SELECT pe.id INTO v_entry_id
    FROM public.payroll_entries pe
    JOIN public.profiles p ON p.id = pe.profile_id
    WHERE pe.payroll_run_id = v_run_id
      AND p.email = emp.email
      AND p.organization_id = c_org_id;

    IF v_entry_id IS NULL THEN
      RAISE WARNING 'No entry found for % — skipping.', emp.email;
      CONTINUE;
    END IF;

    UPDATE public.payroll_entries
    SET
      earnings_breakdown = earnings_breakdown || jsonb_build_array(
        jsonb_build_object(
          'name',       emp.component_name,
          'amount',     emp.amount,
          'monthly',    emp.amount,
          'annual',     emp.amount * 12,
          'is_taxable', true
        )
      ),
      gross_earnings = gross_earnings + emp.amount,
      net_pay        = net_pay        + emp.amount
    WHERE id = v_entry_id;

    RAISE NOTICE 'Added % ₹% for %', emp.component_name, emp.amount, emp.email;
  END LOOP;

  -- ── Refresh run-level totals ───────────────────────────────────────
  UPDATE public.payroll_runs
  SET
    total_gross = (SELECT SUM(gross_earnings) FROM public.payroll_entries WHERE payroll_run_id = v_run_id),
    total_net   = (SELECT SUM(net_pay)        FROM public.payroll_entries WHERE payroll_run_id = v_run_id)
  WHERE id = v_run_id;

  RAISE NOTICE 'March 2026 bonus/incentive applied and run totals refreshed.';
END $$;
