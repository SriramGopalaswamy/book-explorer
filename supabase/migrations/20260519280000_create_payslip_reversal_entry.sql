BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- GBC-139: When a payslip dispute is approved, the original payroll
-- entry is marked "superseded" but no GL reversal was posted, leaving
-- the books double-counting the salary.  This RPC is called by
-- useFinanceReviewDispute (src/hooks/usePayslipDisputes.ts) and posts
-- an individual-employee adjusting journal entry that mirrors (negates)
-- the original run's payroll journal lines for that employee.
--
-- If p_corrected_entry_id is supplied (after HR posts the revised
-- payslip), a second journal entry restores the corrected amounts.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_payslip_reversal_entry(
  p_original_entry_id  uuid,   -- payroll_entries.id being superseded
  p_corrected_entry_id uuid,   -- payroll_entries.id of correction (nullable)
  p_dispute_id         uuid    -- payslip_disputes.id for reference
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id        uuid;
  v_pay_period    text;
  v_emp_name      text;
  v_gross_orig    numeric;
  v_net_orig      numeric;
  v_ded_orig      numeric;
  v_gross_new     numeric;
  v_net_new       numeric;
  v_ded_new       numeric;
  v_salary_exp    uuid;
  v_salary_pay    uuid;
  v_pf_pay        uuid;
  v_je_rev        uuid;
  v_je_cor        uuid;
BEGIN
  -- ── 1. Fetch original entry amounts ─────────────────────────────
  SELECT
    pe.organization_id,
    pr.pay_period,
    COALESCE(p.full_name, 'Unknown Employee'),
    COALESCE(pe.gross_earnings, 0),
    COALESCE(pe.net_pay,        0),
    COALESCE(pe.total_deductions, 0)
  INTO
    v_org_id, v_pay_period, v_emp_name, v_gross_orig, v_net_orig, v_ded_orig
  FROM payroll_entries pe
  JOIN payroll_runs    pr ON pr.id = pe.payroll_run_id
  LEFT JOIN profiles    p  ON p.id  = pe.profile_id
  WHERE pe.id = p_original_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_ENTRY_NOT_FOUND: %', p_original_entry_id;
  END IF;

  -- Nothing to reverse if amounts are zero
  IF v_gross_orig = 0 AND v_net_orig = 0 THEN
    RETURN;
  END IF;

  -- ── 2. Resolve GL accounts (same logic as fn_auto_post_payroll_journal) ──
  SELECT id INTO v_salary_exp
  FROM   gl_accounts
  WHERE  organization_id = v_org_id
    AND  account_type IN ('expense')
    AND  (code LIKE '51%' OR name ILIKE '%salary%' OR name ILIKE '%payroll%')
    AND  is_active = TRUE
  ORDER  BY code ASC
  LIMIT  1;

  SELECT id INTO v_salary_pay
  FROM   gl_accounts
  WHERE  organization_id = v_org_id
    AND  account_type = 'liability'
    AND  (code = '2300' OR name ILIKE '%salary payable%')
    AND  is_active = TRUE
  LIMIT  1;

  IF v_salary_pay IS NULL THEN
    SELECT id INTO v_salary_pay
    FROM   gl_accounts
    WHERE  organization_id = v_org_id
      AND  account_type = 'liability'
      AND  is_active = TRUE
    ORDER  BY code ASC
    LIMIT  1;
  END IF;

  SELECT id INTO v_pf_pay
  FROM   gl_accounts
  WHERE  organization_id = v_org_id
    AND  account_type = 'liability'
    AND  (code = '2400' OR name ILIKE '%pf%' OR name ILIKE '%provident%')
    AND  is_active = TRUE
  LIMIT  1;

  -- Cannot proceed without both accounts
  IF v_salary_exp IS NULL OR v_salary_pay IS NULL THEN
    RETURN;
  END IF;

  -- ── 3. Post reversal JE for the superseded entry ─────────────────
  -- Mirror the original: Credit Salary Expense / Debit Salary Payable
  INSERT INTO journal_entries
    (organization_id, entry_date, memo, status, is_posted, source_type, source_id, is_reversal, created_by)
  VALUES
    (v_org_id, CURRENT_DATE,
     'Payslip dispute reversal: ' || v_emp_name || ' (' || v_pay_period || ')',
     'posted', TRUE, 'payroll', p_original_entry_id::text, TRUE,
     auth.uid())
  RETURNING id INTO v_je_rev;

  IF v_pf_pay IS NOT NULL AND v_ded_orig > 0 THEN
    INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit, credit, description)
    VALUES
      (v_je_rev, v_salary_exp, 0,             v_gross_orig, 'Reversal: salary expense - ' || v_emp_name),
      (v_je_rev, v_salary_pay, v_net_orig,    0,            'Reversal: net salary payable - ' || v_emp_name),
      (v_je_rev, v_pf_pay,    v_ded_orig,    0,            'Reversal: deductions - ' || v_emp_name);
  ELSE
    INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit, credit, description)
    VALUES
      (v_je_rev, v_salary_exp, 0,             v_gross_orig, 'Reversal: salary expense - ' || v_emp_name),
      (v_je_rev, v_salary_pay, v_gross_orig,  0,            'Reversal: salary payable - ' || v_emp_name);
  END IF;

  -- ── 4. Post corrected-entry JE if available ──────────────────────
  IF p_corrected_entry_id IS NOT NULL THEN
    SELECT
      COALESCE(pe.gross_earnings, 0),
      COALESCE(pe.net_pay,        0),
      COALESCE(pe.total_deductions, 0)
    INTO v_gross_new, v_net_new, v_ded_new
    FROM payroll_entries pe
    WHERE pe.id = p_corrected_entry_id
      AND pe.organization_id = v_org_id;

    IF FOUND AND (v_gross_new > 0 OR v_net_new > 0) THEN
      INSERT INTO journal_entries
        (organization_id, entry_date, memo, status, is_posted, source_type, source_id, created_by)
      VALUES
        (v_org_id, CURRENT_DATE,
         'Payslip dispute correction: ' || v_emp_name || ' (' || v_pay_period || ')',
         'posted', TRUE, 'payroll', p_corrected_entry_id::text,
         auth.uid())
      RETURNING id INTO v_je_cor;

      IF v_pf_pay IS NOT NULL AND v_ded_new > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit, credit, description)
        VALUES
          (v_je_cor, v_salary_exp, v_gross_new, 0,           'Corrected: salary expense - ' || v_emp_name),
          (v_je_cor, v_salary_pay, 0,           v_net_new,   'Corrected: net salary payable - ' || v_emp_name),
          (v_je_cor, v_pf_pay,    0,            v_ded_new,   'Corrected: deductions - ' || v_emp_name);
      ELSE
        INSERT INTO journal_lines (journal_entry_id, gl_account_id, debit, credit, description)
        VALUES
          (v_je_cor, v_salary_exp, v_gross_new,  0,            'Corrected: salary expense - ' || v_emp_name),
          (v_je_cor, v_salary_pay, 0,            v_gross_new,  'Corrected: salary payable - ' || v_emp_name);
      END IF;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payslip_reversal_entry(uuid, uuid, uuid) TO authenticated;

COMMIT;
