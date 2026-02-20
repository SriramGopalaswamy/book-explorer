
-- Add HSN/SAC and GST columns to invoice_items
ALTER TABLE public.invoice_items 
  ADD COLUMN IF NOT EXISTS hsn_sac text,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0;

-- Add GST/terms/notes columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'Due on Receipt',
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS customer_gstin text;

-- Create invoice_settings table for company info, logo, signatures, bank details
CREATE TABLE public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_name text DEFAULT 'GRX10 SOLUTIONS PRIVATE LIMITED',
  cin text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India',
  gstin text,
  phone text,
  email text,
  website text,
  logo_url text,
  signature_url text,
  msme_number text,
  bank_name text,
  account_name text,
  account_number text,
  account_type text DEFAULT 'Current Account',
  branch text,
  ifsc_code text,
  upi_code text,
  custom_footer_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_settings - Finance and Admin only
CREATE POLICY "Finance and admin can view invoice settings"
  ON public.invoice_settings FOR SELECT
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Finance and admin can insert invoice settings"
  ON public.invoice_settings FOR INSERT
  WITH CHECK (is_admin_or_finance(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Finance and admin can update invoice settings"
  ON public.invoice_settings FOR UPDATE
  USING (is_admin_or_finance(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Finance and admin can delete invoice settings"
  ON public.invoice_settings FOR DELETE
  USING (is_admin_or_finance(auth.uid()) AND auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for invoice assets (logos, signatures)
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-assets', 'invoice-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for invoice assets
CREATE POLICY "Finance and admin can upload invoice assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoice-assets' AND is_admin_or_finance(auth.uid()));

CREATE POLICY "Anyone can view invoice assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-assets');

CREATE POLICY "Finance and admin can update invoice assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoice-assets' AND is_admin_or_finance(auth.uid()));

CREATE POLICY "Finance and admin can delete invoice assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoice-assets' AND is_admin_or_finance(auth.uid()));
