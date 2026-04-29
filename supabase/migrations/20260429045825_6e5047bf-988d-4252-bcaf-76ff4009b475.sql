ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled'));

ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_status_check
  CHECK (status IN ('draft','processed','completed','approved','superseded'));

ALTER TABLE public.payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_status_check;
ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_status_check
  CHECK (status IN ('computed','approved','locked'));