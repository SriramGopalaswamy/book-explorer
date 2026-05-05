-- Item 37: Add currency_code + exchange_rate to expenses, payroll_records,
-- and payroll_entries. invoices, bills, sales_orders, financial_records
-- already have these columns.
--
-- Default INR / 1.0 is safe for all existing rows in an India-focused ERP.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency_code TEXT         NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS currency_code TEXT         NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS currency_code TEXT         NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6) NOT NULL DEFAULT 1.0;
