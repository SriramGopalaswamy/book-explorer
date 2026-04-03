-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Add currency_code and exchange_rate to financial_records.
--
-- The multi-currency migration (20260306131244) added these columns to
-- invoices, bills, sales_orders and purchase_orders but skipped
-- financial_records.  The Accounting module therefore threw a DB error
-- whenever a user tried to create a non-INR transaction.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC DEFAULT 1;

-- Back-fill existing rows so they are consistent
UPDATE public.financial_records
SET
  currency_code = COALESCE(currency_code, 'INR'),
  exchange_rate  = COALESCE(exchange_rate,  1)
WHERE currency_code IS NULL OR exchange_rate IS NULL;

COMMENT ON COLUMN public.financial_records.currency_code IS
  'ISO 4217 currency code for this transaction (default INR)';
COMMENT ON COLUMN public.financial_records.exchange_rate IS
  '1 unit of currency_code expressed in INR at transaction time';
