-- ══════════════════════════════════════════════════════════════════════
-- GBC-4 — soft-delete views
--
-- Per the audit's "strict: analytics exclude soft-deleted everywhere"
-- decision, this migration introduces `v_<table>_active` views over every
-- table that carries a `deleted_at` column. Each view is `security_invoker`
-- so the underlying table's RLS still applies — defence-in-depth, not a
-- security boundary.
--
-- Hooks that drive dashboards / KPIs / analytics should select from the
-- view rather than the base table; hooks that need full historical /
-- audit visibility continue to select from the base table directly.
--
-- Tables with deleted_at (discovered via static scan, 2026-05-08):
--   bank_transactions, bills, chart_of_accounts, expenses,
--   financial_records, invoice_items, invoices, journal_entries,
--   payroll_records, profiles, scheduled_payments
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_invoices_active WITH (security_invoker = on) AS
  SELECT * FROM public.invoices WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_bills_active WITH (security_invoker = on) AS
  SELECT * FROM public.bills WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_expenses_active WITH (security_invoker = on) AS
  SELECT * FROM public.expenses WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_financial_records_active WITH (security_invoker = on) AS
  SELECT * FROM public.financial_records WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_journal_entries_active WITH (security_invoker = on) AS
  SELECT * FROM public.journal_entries WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_payroll_records_active WITH (security_invoker = on) AS
  SELECT * FROM public.payroll_records WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_bank_transactions_active WITH (security_invoker = on) AS
  SELECT * FROM public.bank_transactions WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_invoice_items_active WITH (security_invoker = on) AS
  SELECT * FROM public.invoice_items WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_chart_of_accounts_active WITH (security_invoker = on) AS
  SELECT * FROM public.chart_of_accounts WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_profiles_active WITH (security_invoker = on) AS
  SELECT * FROM public.profiles WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_scheduled_payments_active WITH (security_invoker = on) AS
  SELECT * FROM public.scheduled_payments WHERE deleted_at IS NULL;

GRANT SELECT ON public.v_invoices_active,
                public.v_bills_active,
                public.v_expenses_active,
                public.v_financial_records_active,
                public.v_journal_entries_active,
                public.v_payroll_records_active,
                public.v_bank_transactions_active,
                public.v_invoice_items_active,
                public.v_chart_of_accounts_active,
                public.v_profiles_active,
                public.v_scheduled_payments_active
              TO authenticated;
