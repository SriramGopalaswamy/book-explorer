ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC DEFAULT 1;

UPDATE public.financial_records
SET
  currency_code = COALESCE(currency_code, 'INR'),
  exchange_rate  = COALESCE(exchange_rate,  1)
WHERE currency_code IS NULL OR exchange_rate IS NULL;

COMMENT ON COLUMN public.financial_records.currency_code IS
  'ISO 4217 currency code for this transaction (default INR)';
COMMENT ON COLUMN public.financial_records.exchange_rate IS
  '1 unit of currency_code expressed in INR at transaction time';