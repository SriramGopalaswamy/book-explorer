
-- =====================================================
-- GST E-Invoice Module (IRP/NIC Compliance)
-- =====================================================

CREATE TABLE public.e_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id),
  
  -- IRN Details (from NIC/IRP)
  irn TEXT UNIQUE,
  irn_generated_at TIMESTAMPTZ,
  ack_number TEXT,
  ack_date TIMESTAMPTZ,
  signed_invoice TEXT, -- Base64 signed JSON
  signed_qr_code TEXT, -- QR code data for printing
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'generated', 'cancelled', 'failed'
  cancel_reason TEXT,
  cancel_remark TEXT,
  cancelled_at TIMESTAMPTZ,
  
  -- Document Details (mirrored for standalone reference)
  doc_type TEXT NOT NULL DEFAULT 'INV', -- INV, CRN, DBN
  doc_number TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  supply_type TEXT NOT NULL DEFAULT 'B2B', -- B2B, B2C, SEZWP, SEZWOP, EXPWP, EXPWOP, DEXP
  
  -- Seller Details
  seller_gstin TEXT NOT NULL,
  seller_legal_name TEXT NOT NULL,
  seller_trade_name TEXT,
  seller_address TEXT,
  seller_location TEXT,
  seller_pincode TEXT,
  seller_state_code TEXT,
  
  -- Buyer Details
  buyer_gstin TEXT,
  buyer_legal_name TEXT NOT NULL,
  buyer_trade_name TEXT,
  buyer_address TEXT,
  buyer_location TEXT,
  buyer_pincode TEXT,
  buyer_state_code TEXT,
  buyer_pos TEXT, -- Place of Supply (state code)
  
  -- Value Details
  total_assessable_value NUMERIC NOT NULL DEFAULT 0,
  total_cgst NUMERIC NOT NULL DEFAULT 0,
  total_sgst NUMERIC NOT NULL DEFAULT 0,
  total_igst NUMERIC NOT NULL DEFAULT 0,
  total_cess NUMERIC NOT NULL DEFAULT 0,
  total_discount NUMERIC NOT NULL DEFAULT 0,
  total_other_charges NUMERIC NOT NULL DEFAULT 0,
  total_invoice_value NUMERIC NOT NULL DEFAULT 0,
  round_off_amount NUMERIC DEFAULT 0,
  
  -- Item Details (stored as JSONB for flexibility)
  items JSONB NOT NULL DEFAULT '[]',
  
  -- NIC API Response
  api_response JSONB,
  error_details JSONB,
  
  -- E-Way Bill auto-generation
  eway_bill_number TEXT,
  eway_bill_date TEXT,
  eway_bill_valid_until TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.e_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view org e-invoices"
  ON public.e_invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = e_invoices.organization_id
    )
  );

CREATE POLICY "Users can create e-invoices"
  ON public.e_invoices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own e-invoices"
  ON public.e_invoices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = e_invoices.organization_id
    )
  );

-- Auto-set organization_id
CREATE OR REPLACE FUNCTION public.auto_set_einvoice_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT p.organization_id INTO NEW.organization_id
    FROM public.profiles p WHERE p.user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_set_einvoice_org
  BEFORE INSERT ON public.e_invoices
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_einvoice_org();

-- Validation trigger for e-invoice
CREATE OR REPLACE FUNCTION public.validate_einvoice()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Validate seller GSTIN
  IF NEW.seller_gstin IS NULL OR NEW.seller_gstin !~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$' THEN
    RAISE EXCEPTION 'Invalid Seller GSTIN format';
  END IF;
  
  -- Validate buyer GSTIN for B2B
  IF NEW.supply_type = 'B2B' AND (NEW.buyer_gstin IS NULL OR NEW.buyer_gstin !~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$') THEN
    RAISE EXCEPTION 'Buyer GSTIN is required for B2B supply';
  END IF;
  
  -- Validate pincode
  IF NEW.seller_pincode IS NOT NULL AND NEW.seller_pincode !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Invalid Seller Pincode';
  END IF;
  
  IF NEW.buyer_pincode IS NOT NULL AND NEW.buyer_pincode !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Invalid Buyer Pincode';
  END IF;
  
  -- Total must be positive
  IF NEW.total_invoice_value <= 0 THEN
    RAISE EXCEPTION 'Invoice value must be positive';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_einvoice
  BEFORE INSERT OR UPDATE ON public.e_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_einvoice();
