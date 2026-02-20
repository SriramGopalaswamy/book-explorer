
-- Add GST and metadata columns to quotes table
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'Due on Receipt',
  ADD COLUMN IF NOT EXISTS customer_gstin text,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;

-- Add GST columns to quote_items table
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS hsn_sac text,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0;
