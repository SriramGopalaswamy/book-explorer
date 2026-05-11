-- Soft-delete columns on the 11 core tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'invoices','bills','expenses','financial_records','journal_entries',
    'payroll_records','bank_transactions','invoice_items','chart_of_accounts',
    'profiles','scheduled_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_active
         ON public.%I (id) WHERE is_deleted = false', t, t);
  END LOOP;
END $$;

-- security_invoker views so existing RLS continues to apply
CREATE OR REPLACE VIEW public.v_invoices_active           WITH (security_invoker=on) AS SELECT * FROM public.invoices           WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_bills_active              WITH (security_invoker=on) AS SELECT * FROM public.bills              WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_expenses_active           WITH (security_invoker=on) AS SELECT * FROM public.expenses           WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_financial_records_active  WITH (security_invoker=on) AS SELECT * FROM public.financial_records  WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_journal_entries_active    WITH (security_invoker=on) AS SELECT * FROM public.journal_entries    WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_payroll_records_active    WITH (security_invoker=on) AS SELECT * FROM public.payroll_records    WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_bank_transactions_active  WITH (security_invoker=on) AS SELECT * FROM public.bank_transactions  WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_invoice_items_active      WITH (security_invoker=on) AS SELECT * FROM public.invoice_items      WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_chart_of_accounts_active  WITH (security_invoker=on) AS SELECT * FROM public.chart_of_accounts  WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_profiles_active           WITH (security_invoker=on) AS SELECT * FROM public.profiles           WHERE is_deleted = false;
CREATE OR REPLACE VIEW public.v_scheduled_payments_active WITH (security_invoker=on) AS SELECT * FROM public.scheduled_payments WHERE is_deleted = false;

GRANT SELECT ON
  public.v_invoices_active, public.v_bills_active, public.v_expenses_active,
  public.v_financial_records_active, public.v_journal_entries_active,
  public.v_payroll_records_active, public.v_bank_transactions_active,
  public.v_invoice_items_active, public.v_chart_of_accounts_active,
  public.v_profiles_active, public.v_scheduled_payments_active
TO authenticated;