
-- =============================================
-- Fixed Assets Module: Tables, RLS, Triggers
-- =============================================

-- Asset status enum is managed via text for flexibility

-- 1. Main assets table
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID NOT NULL,

  -- Identification
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Equipment',
  sub_category TEXT,
  serial_number TEXT,
  model_number TEXT,
  manufacturer TEXT,
  barcode TEXT,

  -- Acquisition
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  vendor_id UUID REFERENCES public.vendors(id),
  bill_id UUID REFERENCES public.bills(id),
  po_number TEXT,

  -- Location & Assignment
  location TEXT,
  department TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  custodian TEXT,

  -- Depreciation
  useful_life_months INTEGER NOT NULL DEFAULT 60,
  salvage_value NUMERIC NOT NULL DEFAULT 0,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  accumulated_depreciation NUMERIC NOT NULL DEFAULT 0,
  current_book_value NUMERIC NOT NULL DEFAULT 0,
  depreciation_start_date DATE,

  -- Status & Lifecycle
  status TEXT NOT NULL DEFAULT 'active',
  condition TEXT NOT NULL DEFAULT 'good',
  disposal_date DATE,
  disposal_price NUMERIC,
  disposal_method TEXT,
  disposal_notes TEXT,

  -- Warranty & Insurance
  warranty_expiry DATE,
  warranty_provider TEXT,
  insurance_policy TEXT,
  insurance_expiry DATE,

  -- Tagging & Labelling
  last_tagged_date DATE,
  last_tagged_by UUID,
  tag_verified BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Depreciation entries (monthly/periodic schedule)
CREATE TABLE public.asset_depreciation_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  depreciation_amount NUMERIC NOT NULL DEFAULT 0,
  accumulated_depreciation NUMERIC NOT NULL DEFAULT 0,
  book_value_after NUMERIC NOT NULL DEFAULT 0,
  financial_record_id UUID REFERENCES public.financial_records(id),
  is_posted BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation_entries ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for assets
CREATE POLICY "Finance admin can manage org assets"
  ON public.assets FOR ALL
  USING (is_org_admin_or_finance(auth.uid(), organization_id))
  WITH CHECK (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Finance admin can view all org assets"
  ON public.assets FOR SELECT
  USING (is_org_admin_or_finance(auth.uid(), organization_id));

CREATE POLICY "Users can view own assets"
  ON public.assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own assets"
  ON public.assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. RLS Policies for depreciation entries
CREATE POLICY "Finance admin can manage depreciation entries"
  ON public.asset_depreciation_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.assets a
    WHERE a.id = asset_depreciation_entries.asset_id
    AND is_org_admin_or_finance(auth.uid(), a.organization_id)
  ));

CREATE POLICY "Users can view own asset depreciation"
  ON public.asset_depreciation_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.assets a
    WHERE a.id = asset_depreciation_entries.asset_id
    AND a.user_id = auth.uid()
  ));

-- 6. Auto-set organization_id trigger
CREATE TRIGGER set_asset_org_id
  BEFORE INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_organization_id();

-- 7. Updated_at trigger
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Auto-compute current_book_value on insert
CREATE OR REPLACE FUNCTION public.compute_asset_book_value()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  NEW.current_book_value := GREATEST(NEW.purchase_price - NEW.accumulated_depreciation, 0);
  IF NEW.depreciation_start_date IS NULL THEN
    NEW.depreciation_start_date := NEW.purchase_date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compute_asset_book_value_trigger
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_asset_book_value();

-- 9. Post asset disposal to GL
CREATE OR REPLACE FUNCTION public.post_asset_disposal_to_ledger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _gain_loss NUMERIC;
BEGIN
  IF NEW.status = 'disposed' AND (OLD IS NULL OR OLD.status != 'disposed') THEN
    _gain_loss := COALESCE(NEW.disposal_price, 0) - NEW.current_book_value;

    -- Remove asset from books (credit asset)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Fixed Assets',
      NEW.current_book_value, 0, NEW.current_book_value, NEW.id, 'asset_disposal',
      COALESCE(NEW.disposal_date, CURRENT_DATE), CURRENT_DATE,
      'Asset disposed: ' || NEW.name || ' (' || NEW.asset_tag || ')',
      true, now()
    );

    -- Record accumulated depreciation reversal (debit)
    INSERT INTO public.financial_records (
      user_id, organization_id, type, category, amount,
      debit, credit, reference_id, reference_type,
      record_date, posting_date, description, is_posted, posted_at
    ) VALUES (
      NEW.user_id, NEW.organization_id, 'asset', 'Accumulated Depreciation',
      NEW.accumulated_depreciation, NEW.accumulated_depreciation, 0, NEW.id, 'asset_disposal',
      COALESCE(NEW.disposal_date, CURRENT_DATE), CURRENT_DATE,
      'Accum. Depr. reversal: ' || NEW.name,
      true, now()
    );

    -- Cash/proceeds (debit)
    IF COALESCE(NEW.disposal_price, 0) > 0 THEN
      INSERT INTO public.financial_records (
        user_id, organization_id, type, category, amount,
        debit, credit, reference_id, reference_type,
        record_date, posting_date, description, is_posted, posted_at
      ) VALUES (
        NEW.user_id, NEW.organization_id, 'asset', 'Cash',
        NEW.disposal_price, NEW.disposal_price, 0, NEW.id, 'asset_disposal',
        COALESCE(NEW.disposal_date, CURRENT_DATE), CURRENT_DATE,
        'Disposal proceeds: ' || NEW.name,
        true, now()
      );
    END IF;

    -- Gain or loss
    IF _gain_loss > 0 THEN
      INSERT INTO public.financial_records (
        user_id, organization_id, type, category, amount,
        debit, credit, reference_id, reference_type,
        record_date, posting_date, description, is_posted, posted_at
      ) VALUES (
        NEW.user_id, NEW.organization_id, 'revenue', 'Gain on Asset Disposal',
        _gain_loss, 0, _gain_loss, NEW.id, 'asset_disposal',
        COALESCE(NEW.disposal_date, CURRENT_DATE), CURRENT_DATE,
        'Gain on disposal: ' || NEW.name,
        true, now()
      );
    ELSIF _gain_loss < 0 THEN
      INSERT INTO public.financial_records (
        user_id, organization_id, type, category, amount,
        debit, credit, reference_id, reference_type,
        record_date, posting_date, description, is_posted, posted_at
      ) VALUES (
        NEW.user_id, NEW.organization_id, 'expense', 'Loss on Asset Disposal',
        ABS(_gain_loss), ABS(_gain_loss), 0, NEW.id, 'asset_disposal',
        COALESCE(NEW.disposal_date, CURRENT_DATE), CURRENT_DATE,
        'Loss on disposal: ' || NEW.name,
        true, now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER post_asset_disposal_trigger
  AFTER UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.post_asset_disposal_to_ledger();
