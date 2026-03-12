-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Reporting Integrity Suite
--
-- Provides a single entry-point function that runs all integrity checks:
--   run_erp_integrity_checks(org_id) → table of check results
--
-- Checks included:
--   1. Balance Sheet equation      (A = L + E + NI)
--   2. Trial Balance equality      (Dr = Cr)
--   3. Subledger-to-GL reconciliation (AR and AP)
--   4. Payroll approval integrity  (approved_by NOT NULL when approved)
--   5. Open journal balance        (all posted journals are balanced)
--   6. Bill date integrity         (due_date >= bill_date)
--   7. Expense receipt compliance  (approved expenses have receipt_url)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Comprehensive integrity check runner ─────────────────────────────
CREATE OR REPLACE FUNCTION public.run_erp_integrity_checks(
  p_org_id UUID,
  p_as_of  DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  check_name  TEXT,
  status      TEXT,   -- PASS / FAIL / WARN
  detail      TEXT,
  severity    TEXT    -- CRITICAL / HIGH / MEDIUM / LOW
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Balance sheet
  v_bs_assets      NUMERIC;
  v_bs_liab        NUMERIC;
  v_bs_equity      NUMERIC;
  v_bs_ni          NUMERIC;
  v_bs_diff        NUMERIC;
  v_bs_balanced    BOOLEAN;

  -- Trial balance
  v_tb_debits      NUMERIC;
  v_tb_credits     NUMERIC;
  v_tb_diff        NUMERIC;

  -- Subledger
  v_ar_gl          NUMERIC;
  v_ar_sub         NUMERIC;
  v_ap_gl          NUMERIC;
  v_ap_sub         NUMERIC;

  -- Payroll integrity
  v_payroll_fail   INTEGER;

  -- Unbalanced posted journals
  v_unbal_journals INTEGER;

  -- Bill date violations
  v_bill_date_fail INTEGER;

  -- Expense receipt violations
  v_receipt_fail   INTEGER;
BEGIN
  -- ── 1. Balance Sheet ────────────────────────────────────────────────
  BEGIN
    SELECT bs.total_assets, bs.total_liabilities, bs.total_equity,
           bs.net_income, bs.difference, bs.balanced
    INTO   v_bs_assets, v_bs_liab, v_bs_equity, v_bs_ni, v_bs_diff, v_bs_balanced
    FROM   public.validate_balance_sheet(p_org_id, p_as_of) bs;

    RETURN QUERY SELECT
      'Balance Sheet Equation'::TEXT,
      CASE WHEN v_bs_balanced THEN 'PASS' ELSE 'FAIL' END,
      format('A=%.2f  L=%.2f  E=%.2f  NI=%.2f  Diff=%.2f',
             v_bs_assets, v_bs_liab, v_bs_equity, v_bs_ni, v_bs_diff),
      CASE WHEN v_bs_balanced THEN 'LOW' ELSE 'CRITICAL' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Balance Sheet Equation'::TEXT, 'WARN'::TEXT,
      'Could not evaluate: ' || SQLERRM, 'HIGH'::TEXT;
  END;

  -- ── 2. Trial Balance ────────────────────────────────────────────────
  BEGIN
    SELECT tb.total_debits, tb.total_credits, tb.difference
    INTO   v_tb_debits, v_tb_credits, v_tb_diff
    FROM   public.validate_trial_balance(p_org_id, p_as_of) tb;

    RETURN QUERY SELECT
      'Trial Balance'::TEXT,
      CASE WHEN ABS(v_tb_diff) < 0.01 THEN 'PASS' ELSE 'FAIL' END,
      format('Dr=%.2f  Cr=%.2f  Diff=%.2f', v_tb_debits, v_tb_credits, v_tb_diff),
      CASE WHEN ABS(v_tb_diff) < 0.01 THEN 'LOW' ELSE 'CRITICAL' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Trial Balance'::TEXT, 'WARN'::TEXT,
      'Could not evaluate: ' || SQLERRM, 'HIGH'::TEXT;
  END;

  -- ── 3. AR Subledger Reconciliation ──────────────────────────────────
  BEGIN
    SELECT sr.gl_balance, sr.subledger_bal
    INTO   v_ar_gl, v_ar_sub
    FROM   public.validate_subledger_reconciliation(p_org_id) sr
    WHERE  sr.check_name = 'Accounts Receivable';

    RETURN QUERY SELECT
      'AR Subledger Reconciliation'::TEXT,
      CASE WHEN ABS(v_ar_gl - v_ar_sub) < 1.00 THEN 'PASS' ELSE 'FAIL' END,
      format('GL=%.2f  Subledger=%.2f  Diff=%.2f', v_ar_gl, v_ar_sub, v_ar_gl - v_ar_sub),
      CASE WHEN ABS(v_ar_gl - v_ar_sub) < 1.00 THEN 'LOW' ELSE 'HIGH' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'AR Subledger Reconciliation'::TEXT, 'WARN'::TEXT,
      'Could not evaluate: ' || SQLERRM, 'MEDIUM'::TEXT;
  END;

  -- ── 4. AP Subledger Reconciliation ──────────────────────────────────
  BEGIN
    SELECT sr.gl_balance, sr.subledger_bal
    INTO   v_ap_gl, v_ap_sub
    FROM   public.validate_subledger_reconciliation(p_org_id) sr
    WHERE  sr.check_name = 'Accounts Payable';

    RETURN QUERY SELECT
      'AP Subledger Reconciliation'::TEXT,
      CASE WHEN ABS(v_ap_gl - v_ap_sub) < 1.00 THEN 'PASS' ELSE 'FAIL' END,
      format('GL=%.2f  Subledger=%.2f  Diff=%.2f', v_ap_gl, v_ap_sub, v_ap_gl - v_ap_sub),
      CASE WHEN ABS(v_ap_gl - v_ap_sub) < 1.00 THEN 'LOW' ELSE 'HIGH' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'AP Subledger Reconciliation'::TEXT, 'WARN'::TEXT,
      'Could not evaluate: ' || SQLERRM, 'MEDIUM'::TEXT;
  END;

  -- ── 5. Payroll Approval Integrity ────────────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_payroll_fail
    FROM   public.payroll_runs
    WHERE  organization_id = p_org_id
      AND  status IN ('approved', 'locked', 'completed', 'finalized')
      AND  approved_by IS NULL;

    RETURN QUERY SELECT
      'Payroll Approval Integrity'::TEXT,
      CASE WHEN v_payroll_fail = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('%s payroll run(s) approved without approved_by', v_payroll_fail),
      CASE WHEN v_payroll_fail = 0 THEN 'LOW' ELSE 'HIGH' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Payroll Approval Integrity'::TEXT, 'WARN'::TEXT,
      SQLERRM, 'MEDIUM'::TEXT;
  END;

  -- ── 6. Unbalanced Posted Journals ────────────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_unbal_journals
    FROM   public.journal_entries je
    WHERE  je.organization_id = p_org_id
      AND  je.is_posted = TRUE
      AND  ABS(
             (SELECT COALESCE(SUM(jl.debit),  0) FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id) -
             (SELECT COALESCE(SUM(jl.credit), 0) FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id)
           ) >= 0.01;

    RETURN QUERY SELECT
      'Posted Journal Balance Check'::TEXT,
      CASE WHEN v_unbal_journals = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('%s unbalanced posted journal(s) found', v_unbal_journals),
      CASE WHEN v_unbal_journals = 0 THEN 'LOW' ELSE 'CRITICAL' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Posted Journal Balance Check'::TEXT, 'WARN'::TEXT,
      SQLERRM, 'MEDIUM'::TEXT;
  END;

  -- ── 7. Bill Date Integrity ───────────────────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_bill_date_fail
    FROM   public.bills
    WHERE  organization_id = p_org_id
      AND  due_date IS NOT NULL
      AND  due_date < bill_date;

    RETURN QUERY SELECT
      'Bill Due Date Integrity'::TEXT,
      CASE WHEN v_bill_date_fail = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('%s bill(s) with due_date < bill_date', v_bill_date_fail),
      CASE WHEN v_bill_date_fail = 0 THEN 'LOW' ELSE 'MEDIUM' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Bill Due Date Integrity'::TEXT, 'WARN'::TEXT,
      SQLERRM, 'LOW'::TEXT;
  END;

  -- ── 8. Expense Receipt Compliance ────────────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_receipt_fail
    FROM   public.expenses
    WHERE  organization_id IN (
             SELECT organization_id FROM public.profiles
             WHERE  user_id = (SELECT user_id FROM public.profiles
                               WHERE  organization_id = p_org_id LIMIT 1)
           )
      AND  status = 'approved'
      AND  receipt_url IS NULL;

    RETURN QUERY SELECT
      'Expense Receipt Compliance'::TEXT,
      CASE WHEN v_receipt_fail = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('%s approved expense(s) missing receipt_url', v_receipt_fail),
      CASE WHEN v_receipt_fail = 0 THEN 'LOW' ELSE 'MEDIUM' END;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'Expense Receipt Compliance'::TEXT, 'WARN'::TEXT,
      SQLERRM, 'LOW'::TEXT;
  END;

END;
$$;

COMMENT ON FUNCTION public.run_erp_integrity_checks(UUID, DATE) IS
  'Runs all ERP financial integrity checks for an organization. Returns check_name, status (PASS/FAIL/WARN), detail, and severity.';

-- ── Convenience view: latest integrity check results ─────────────────
-- (Cannot be a view because it calls a set-returning function with args,
--  but can be called directly as a query)

-- ── Verification hint ─────────────────────────────────────────────────
-- SELECT * FROM public.run_erp_integrity_checks('<org_id>');
-- Expected (after all fixes applied):
--   Balance Sheet Equation      | PASS
--   Trial Balance               | PASS
--   AR Subledger Reconciliation | PASS
--   AP Subledger Reconciliation | PASS
--   Payroll Approval Integrity  | PASS
--   Posted Journal Balance Check| PASS
--   Bill Due Date Integrity     | PASS
--   Expense Receipt Compliance  | PASS
