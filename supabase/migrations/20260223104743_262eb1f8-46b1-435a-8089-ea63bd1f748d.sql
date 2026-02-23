
-- Add invoice_date column (defaults to current date, user-editable)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_date date NOT NULL DEFAULT CURRENT_DATE;
