-- =====================================================================
-- FINANCIAL INTEGRITY SYSTEM - PHASE 1: Currency Normalization
-- =====================================================================
-- Migration: 20260218060400_financial_integrity_phase1_currency_normalization.sql
-- Description: Adds currency normalization to journal lines
-- Dependencies: journal_entries, journal_entry_lines
-- =====================================================================

-- Add currency fields to journal_entry_lines
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS transaction_currency TEXT DEFAULT 'USD' NOT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6) DEFAULT 1.0 NOT NULL,
  ADD COLUMN IF NOT EXISTS base_currency_amount NUMERIC(15,2);

-- Add posting_date as canonical financial date to journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS posting_date DATE;

-- Backfill posting_date with entry_date for existing records
UPDATE journal_entries
SET posting_date = entry_date
WHERE posting_date IS NULL;

-- Make posting_date NOT NULL after backfill
ALTER TABLE journal_entries
  ALTER COLUMN posting_date SET NOT NULL;

-- Backfill base_currency_amount for existing records
-- For USD transactions with rate 1.0, base amount = debit or credit
UPDATE journal_entry_lines
SET base_currency_amount = CASE 
  WHEN debit > 0 THEN debit 
  ELSE credit 
END
WHERE base_currency_amount IS NULL;

-- Make base_currency_amount NOT NULL after backfill
ALTER TABLE journal_entry_lines
  ALTER COLUMN base_currency_amount SET NOT NULL;

-- Add constraint to ensure exchange_rate is positive
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT check_positive_exchange_rate 
  CHECK (exchange_rate > 0);

-- Add constraint to ensure currency code is valid (ISO 4217)
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT check_valid_currency_code 
  CHECK (transaction_currency ~ '^[A-Z]{3}$');

-- Create index on posting_date for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_posting_date 
  ON journal_entries(posting_date DESC);

-- Create index on transaction_currency for reporting
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_currency 
  ON journal_entry_lines(transaction_currency);

-- Add comment for documentation
COMMENT ON COLUMN journal_entry_lines.transaction_currency IS 
  'ISO 4217 currency code for the original transaction';
COMMENT ON COLUMN journal_entry_lines.exchange_rate IS 
  'Exchange rate to base currency at transaction time';
COMMENT ON COLUMN journal_entry_lines.base_currency_amount IS 
  'Amount in base currency (USD) for consistent aggregation';
COMMENT ON COLUMN journal_entries.posting_date IS 
  'Canonical financial truth date - use this for all reports';

-- =====================================================================
-- FUNCTION: Calculate Base Currency Amount
-- =====================================================================
CREATE OR REPLACE FUNCTION calculate_base_currency_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate base currency amount based on debit/credit and exchange rate
  IF NEW.debit > 0 THEN
    NEW.base_currency_amount := NEW.debit * NEW.exchange_rate;
  ELSE
    NEW.base_currency_amount := NEW.credit * NEW.exchange_rate;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate base currency amount
DROP TRIGGER IF EXISTS trg_calculate_base_currency_amount ON journal_entry_lines;
CREATE TRIGGER trg_calculate_base_currency_amount
  BEFORE INSERT OR UPDATE ON journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION calculate_base_currency_amount();

-- =====================================================================
-- Grant permissions
-- =====================================================================
GRANT SELECT ON journal_entry_lines TO authenticated;
GRANT SELECT ON journal_entries TO authenticated;
