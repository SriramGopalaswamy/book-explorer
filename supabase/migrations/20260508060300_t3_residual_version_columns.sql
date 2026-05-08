-- ══════════════════════════════════════════════════════════════════════
-- GBC-10 / T3 residual: optimistic-concurrency version column on the
-- five tables Lovable's first T3 pass missed.
--
-- 20260508051926 enrolled 12 doc tables (bills, credit_notes, delivery_notes,
-- expenses, goods_receipts, journal_entries, picking_lists, purchase_orders,
-- quotes, sales_orders, stock_adjustments, stock_transfers).
-- The audit prompt also requested it on master-data and ledger tables:
-- profiles, items, salary_structures, financial_records, payroll_records.
--
-- Reuses the existing public.bump_row_version() trigger function.
-- ══════════════════════════════════════════════════════════════════════
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'items',
    'salary_structures',
    'financial_records',
    'payroll_records'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t)
    THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_version ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_bump_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()', t);
    END IF;
  END LOOP;
END
$do$;
