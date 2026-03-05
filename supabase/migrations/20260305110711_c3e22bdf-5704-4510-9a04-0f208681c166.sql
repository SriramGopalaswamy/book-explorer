-- Fix search_path on newly created validation functions
ALTER FUNCTION validate_expense_amount() SET search_path = public;
ALTER FUNCTION validate_invoice_amount() SET search_path = public;
ALTER FUNCTION validate_leave_request() SET search_path = public;
ALTER FUNCTION validate_payroll_record() SET search_path = public;
ALTER FUNCTION validate_reimbursement_amount() SET search_path = public;
ALTER FUNCTION validate_journal_balance_on_post() SET search_path = public;