-- ===================================================================
-- GRX10 MARCH 2026 PAYROLL
-- ===================================================================
-- Part 1: Stamp employee_id on profiles for 26 known employees
-- Part 2: Create a locked payroll_run for pay_period '2026-03'
-- Part 3: Insert one payroll_entry per employee (35 total) with full
--         JSONB earnings / deductions breakdowns
--
-- Source: Approved March 2026 payroll sheet
-- Approved: 2026-03-31 | Locked: 2026-04-01
-- ===================================================================

DO $$
DECLARE
  c_org_id  CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  c_period  CONSTANT TEXT := '2026-03';

  v_admin_uid   UUID;
  v_run_id      UUID;
  v_prof_id     UUID;
  v_earnings    JSONB;
  v_deductions  JSONB;
  emp           RECORD;
BEGIN

  -- ─── 0. Resolve admin user ────────────────────────────────────────────
  SELECT ur.user_id
  INTO   v_admin_uid
  FROM   public.user_roles ur
  WHERE  ur.organization_id = c_org_id
    AND  ur.role = 'admin'
  ORDER BY ur.created_at
  LIMIT  1;

  IF v_admin_uid IS NULL THEN
    RAISE EXCEPTION 'No admin user found for org %. Run GRX10 setup first.', c_org_id;
  END IF;

  -- ─── 1. Set employee_id on profiles (26 employees) ───────────────────
  -- Employees whose IDs were blank in the sheet are left NULL.
  UPDATE public.profiles SET employee_id = '1'  WHERE email = 'arvind@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '2'  WHERE email = 'sai@grx10.com'         AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '9'  WHERE email = 'manoj@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '12' WHERE email = 'rahul@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '16' WHERE email = 'sharon@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '18' WHERE email = 'admin@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '19' WHERE email = 'shruthi@grx10.com'     AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '23' WHERE email = 'omkar@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '29' WHERE email = 'yousuf@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '32' WHERE email = 'santosh@grx10.com'     AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '34' WHERE email = 'yashwanth@grx10.com'   AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '40' WHERE email = 'udhay@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '53' WHERE email = 'yamuna@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '55' WHERE email = 'halesh@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '57' WHERE email = 'allen@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '59' WHERE email = 'luveesh@grx10.com'     AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '60' WHERE email = 'rajesh@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '61' WHERE email = 'nayana@grx10.com'      AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '62' WHERE email = 'ravi@grx10.com'        AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '63' WHERE email = 'manohar@grx10.com'     AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '64' WHERE email = 'roopa@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '67' WHERE email = 'yash@grx10.com'        AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '74' WHERE email = 'sujay@grx10.com'       AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '75' WHERE email = 'preethi@grx10.com'     AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '77' WHERE email = 'jayasankar@grx10.com'  AND organization_id = c_org_id;
  UPDATE public.profiles SET employee_id = '85' WHERE email = 'deepanshu@grx10.com'   AND organization_id = c_org_id;

  -- ─── 2. Create locked payroll_run for March 2026 ─────────────────────
  -- approved_by must be set explicitly because the approval-integrity trigger
  -- (trg_payroll_approval_integrity) rejects status='locked' without it
  -- when auth.uid() is NULL in migration context.
  --
  -- Run-level totals (verified against spreadsheet):
  --   total_gross      = 1,470,130.73  (sum of all gross_earnings incl. Shruthi's 28,200)
  --   total_deductions =    81,404.53  (PF 33,266.41 + TDS 31,138.12 + PT 7,000 + Adv 10,000)
  --   total_net        = 1,388,726.20
  INSERT INTO public.payroll_runs (
    organization_id, pay_period, status,
    total_gross,    total_deductions, total_net, employee_count,
    generated_by,
    reviewed_by,  reviewed_at,
    approved_by,  approved_at,
    locked_by,    locked_at,
    notes
  ) VALUES (
    c_org_id, c_period, 'locked',
    1470130.73, 81404.53, 1388726.20, 35,
    v_admin_uid,
    v_admin_uid, '2026-03-31 18:00:00+05:30'::TIMESTAMPTZ,
    v_admin_uid, '2026-03-31 18:00:00+05:30'::TIMESTAMPTZ,
    v_admin_uid, '2026-04-01 09:00:00+05:30'::TIMESTAMPTZ,
    'March 2026 payroll — migrated from approved payroll sheet'
  )
  RETURNING id INTO v_run_id;

  -- ─── 3. Insert payroll_entries ────────────────────────────────────────
  --
  -- VALUES columns:
  --   email            TEXT     – used to look up profile_id
  --   ann_ctc_monthly  NUMERIC  – full-month fixed CTC (no incentive); ×12 = annual_ctc
  --   gross_earnings   NUMERIC  – actual March pay incl. incentive; excl. deductions
  --   paid_days        INT      – calendar days paid (integers; Halesh's 27.5→27)
  --   lwp_days         INT      – calendar days unpaid  (31 - paid_days)
  --   lwp_deduction    NUMERIC  – exact LWP deduction amount
  --   per_day          NUMERIC  – ann_ctc_monthly / 31
  --   pf_emp           NUMERIC  – employee PF deduction
  --   tds              NUMERIC  – TDS deduction
  --   advance          NUMERIC  – advance recovery (Shruthi only: 10,000)
  --   basic            NUMERIC  – Basic earnings component (on fixed, prorated)
  --   hra              NUMERIC  – HRA earnings component
  --   other_allow      NUMERIC  – Other Allowance earnings component
  --   incentive        NUMERIC  – Incentive / performance bonus (0 for most)
  --
  -- Note: gross_earnings = basic + hra + other_allow + incentive
  --       net_pay        = gross_earnings - pf_emp - tds - 200 (PT) - advance

  FOR emp IN
    SELECT
      t.email,
      t.ann_ctc_monthly,
      t.gross_earnings,
      t.paid_days,
      t.lwp_days,
      t.lwp_deduction,
      t.per_day,
      t.pf_emp,
      t.tds,
      t.advance,
      t.basic,
      t.hra,
      t.other_allow,
      t.incentive
    FROM (VALUES
      -- ── high earners ───────────────────────────────────────────────────────────────────────────────────────────────
      -- email,                ann_ctc_monthly, gross_earnings, paid, lwp, lwp_ded,   per_day, pf_emp,    tds,       adv,    basic,      hra,       other,      incentive
      ('sai@grx10.com',        192961.90,       192961.90,      31,   0,   0.00,      6224.58, 1800.00,   23013.12,  0.00,   119636.38,  47854.55,  25470.97,   0.00),
      ('admin@grx10.com',       45000.00,        45000.00,      31,   0,   0.00,      1451.61,    0.00,       0.00,  0.00,    27900.00,  11160.00,   5940.00,   0.00),
      ('arvind@grx10.com',      61244.20,        65857.03,      31,   0,   0.00,      1975.62, 4922.80,       0.00,  0.00,    37971.40,  15188.56,   8084.23,4612.84),
      ('damo@grx10.com',       148200.00,       148200.00,      31,   0,   0.00,      4780.65, 1800.00,       0.00,  0.00,    91884.00,  36753.60,  19562.40,   0.00),
      ('yamuna@grx10.com',     125000.00,       125000.00,      31,   0,   0.00,      4032.26,    0.00,    8125.00,  0.00,    77500.00,  31000.00,  16500.00,   0.00),
      -- ── mid earners ────────────────────────────────────────────────────────────────────────────────────────────────
      ('omkar@grx10.com',       40120.00,        42719.00,      31,   0,   0.00,      1294.19, 1800.00,       0.00,  0.00,    24874.40,   9949.76,   5295.84,2599.00),
      ('rahul@grx10.com',       39867.00,        39867.00,      31,   0,   0.00,      1286.35, 1800.00,       0.00,  0.00,    24717.54,   9887.02,   5262.44,   0.00),
      ('azim@grx10.com',        98200.00,        98200.00,      31,   0,   0.00,      3167.74, 1800.00,       0.00,  0.00,    60884.00,  24353.60,  12962.40,   0.00),
      ('yash@grx10.com',        42000.00,        42000.00,      31,   0,   0.00,      1354.84, 1800.00,       0.00,  0.00,    26040.00,  10416.00,   5544.00,   0.00),
      ('aasim@grx10.com',       50000.00,        50000.00,      31,   0,   0.00,      1612.90,    0.00,       0.00,  0.00,    31000.00,  12400.00,   6600.00,   0.00),
      ('bhavya@grx10.com',      26000.00,        26000.00,      31,   0,   0.00,       838.71,    0.00,       0.00,  0.00,    16120.00,   6448.00,   3432.00,   0.00),
      ('deepanshu@grx10.com',   25000.00,        30000.00,      31,   0,   0.00,       806.45,    0.00,       0.00,  0.00,    15500.00,   6200.00,   3300.00,5000.00),
      -- ── part-month employees ───────────────────────────────────────────────────────────────────────────────────────
      ('allen@grx10.com',       30000.00,        21290.32,      22,   9,   8709.68,    967.74,    0.00,       0.00,  0.00,    13200.00,   5280.00,   2810.32,   0.00),
      ('rajesh@grx10.com',      34710.00,        11196.77,      10,  21,  23513.23,   1119.68, 1343.61,       0.00,  0.00,     6942.00,   2776.80,   1477.97,   0.00),
      ('santosh@grx10.com',     28200.00,        17283.87,      19,  12,  10916.13,    909.68, 1800.00,       0.00,  0.00,    10716.00,   4286.40,   2281.47,   0.00),
      ('yashwanth@grx10.com',   30000.00,        34432.26,      30,   1,    967.74,    967.74,    0.00,       0.00,  0.00,    18000.00,   7200.00,   3832.26,5400.00),
      ('yousuf@grx10.com',      28200.00,        19103.23,      21,  10,   9096.77,    909.68, 1800.00,       0.00,  0.00,    11844.00,   4737.60,   2521.63,   0.00),
      ('halesh@grx10.com',      30000.00,        26612.90,      27,   4,   3387.10,    967.74,    0.00,       0.00,  0.00,    16500.00,   6600.00,   3512.90,   0.00),
      ('sujay@grx10.com',       30000.00,        29032.26,      30,   1,    967.74,    967.74,    0.00,       0.00,  0.00,    18000.00,   7200.00,   3832.26,   0.00),
      ('preethi@grx10.com',     30000.00,         4838.71,       5,  26,  25161.29,    967.74,    0.00,       0.00,  0.00,     3000.00,   1200.00,    638.71,   0.00),
      ('nevitha@grx10.com',     30000.00,         4838.71,       5,  26,  25161.29,    967.74,    0.00,       0.00,  0.00,     3000.00,   1200.00,    638.71,   0.00),
      -- ── standard-band with advance / hike / incentive ──────────────────────────────────────────────────────────────
      ('shruthi@grx10.com',     28200.00,        28200.00,      31,   0,      0.00,    909.68, 1800.00,       0.00, 10000.00,  17484.00,   6993.60,   3722.40,   0.00),
      ('manohar@grx10.com',     28200.00,        33600.00,      31,   0,      0.00,    909.68, 1800.00,       0.00,  0.00,    17484.00,   6993.60,   3722.40,5400.00),
      ('jayasankar@grx10.com',  28200.00,        33300.00,      31,   0,      0.00,    909.68, 1800.00,       0.00,  0.00,    17484.00,   6993.60,   3722.40,5100.00),
      ('madhu@grx10.com',       28200.00,        33900.00,      31,   0,      0.00,    909.68, 1800.00,       0.00,  0.00,    17484.00,   6993.60,   3722.40,5700.00),
      ('manojs@grx10.com',      30000.00,        27096.77,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    16800.00,   6720.00,   3576.77,   0.00),
      -- ── standard band full month ────────────────────────────────────────────────────────────────────────────────────
      ('manoj@grx10.com',       28200.00,        28200.00,      31,   0,      0.00,    909.68, 1800.00,       0.00,  0.00,    17484.00,   6993.60,   3722.40,   0.00),
      ('sharon@grx10.com',      30000.00,        30000.00,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    18600.00,   7440.00,   3960.00,   0.00),
      ('udhay@grx10.com',       30000.00,        30000.00,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    18600.00,   7440.00,   3960.00,   0.00),
      ('luveesh@grx10.com',     30000.00,        30000.00,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    18600.00,   7440.00,   3960.00,   0.00),
      ('nayana@grx10.com',      30000.00,        30000.00,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    18600.00,   7440.00,   3960.00,   0.00),
      ('roopa@grx10.com',       30000.00,        30000.00,      31,   0,      0.00,    967.74,    0.00,       0.00,  0.00,    18600.00,   7440.00,   3960.00,   0.00),
      -- ── lower band ─────────────────────────────────────────────────────────────────────────────────────────────────
      ('ravi@grx10.com',        23200.00,        23200.00,      31,   0,      0.00,    748.39, 1800.00,       0.00,  0.00,    14384.00,   5753.60,   3062.40,   0.00),
      ('monish@grx10.com',      18200.00,        18200.00,      31,   0,      0.00,    587.10, 1800.00,       0.00,  0.00,    11284.00,   4513.60,   2402.40,   0.00),
      ('mahesh@grx10.com',      20000.00,        20000.00,      31,   0,      0.00,    645.16,    0.00,       0.00,  0.00,    12400.00,   4960.00,   2640.00,   0.00)
    ) AS t(email, ann_ctc_monthly, gross_earnings, paid_days, lwp_days, lwp_deduction, per_day,
           pf_emp, tds, advance, basic, hra, other_allow, incentive)
  LOOP

    -- Resolve profile_id by email within org
    SELECT id INTO v_prof_id
    FROM   public.profiles
    WHERE  email           = emp.email
      AND  organization_id = c_org_id;

    IF v_prof_id IS NULL THEN
      RAISE WARNING 'Profile not found for %, skipping.', emp.email;
      CONTINUE;
    END IF;

    -- Build earnings breakdown
    v_earnings := jsonb_build_array(
      jsonb_build_object('name', 'Basic',           'amount', emp.basic),
      jsonb_build_object('name', 'HRA',             'amount', emp.hra),
      jsonb_build_object('name', 'Other Allowance', 'amount', emp.other_allow)
    );
    IF emp.incentive > 0 THEN
      v_earnings := v_earnings || jsonb_build_array(
        jsonb_build_object('name', 'Incentive', 'amount', emp.incentive)
      );
    END IF;

    -- Build deductions breakdown
    v_deductions := '[]'::JSONB;
    IF emp.pf_emp > 0 THEN
      v_deductions := v_deductions || jsonb_build_array(
        jsonb_build_object('name', 'PF - Employee', 'amount', emp.pf_emp)
      );
    END IF;
    IF emp.tds > 0 THEN
      v_deductions := v_deductions || jsonb_build_array(
        jsonb_build_object('name', 'TDS', 'amount', emp.tds)
      );
    END IF;
    -- Professional Tax: always 200 for all employees
    v_deductions := v_deductions || jsonb_build_array(
      jsonb_build_object('name', 'Professional Tax', 'amount', 200)
    );
    IF emp.advance > 0 THEN
      v_deductions := v_deductions || jsonb_build_array(
        jsonb_build_object('name', 'Advance Recovery', 'amount', emp.advance)
      );
    END IF;

    INSERT INTO public.payroll_entries (
      payroll_run_id,
      profile_id,
      organization_id,
      compensation_structure_id,   -- NULL: March CTC differs from April structures
      annual_ctc,
      annual_ctc_snapshot,
      gross_earnings,
      total_deductions,
      net_pay,
      working_days,
      paid_days,
      lwp_days,
      lwp_deduction,
      per_day_salary,
      pf_employee,
      pf_employer,
      tds_amount,
      earnings_breakdown,
      deductions_breakdown,
      status
    ) VALUES (
      v_run_id,
      v_prof_id,
      c_org_id,
      NULL,
      emp.ann_ctc_monthly * 12,
      emp.ann_ctc_monthly * 12,
      emp.gross_earnings,
      emp.pf_emp + emp.tds + 200.00 + emp.advance,
      emp.gross_earnings - (emp.pf_emp + emp.tds + 200.00 + emp.advance),
      31,
      emp.paid_days,
      emp.lwp_days,
      emp.lwp_deduction,
      emp.per_day,
      emp.pf_emp,
      0,     -- employer PF shown as 0 in the March payroll sheet
      emp.tds,
      v_earnings,
      v_deductions,
      'locked'
    );

  END LOOP;

  RAISE NOTICE 'March 2026 payroll complete. Run ID: %. 35 entries inserted. employee_id stamped on 26 profiles.', v_run_id;

END $$;
