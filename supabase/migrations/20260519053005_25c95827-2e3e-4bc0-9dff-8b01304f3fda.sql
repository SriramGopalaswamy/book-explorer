
-- GBC: PAN / GSTIN / Pincode format enforcement
-- Use trigger-based validation (not CHECK) so we can normalize (UPPER/TRIM)
-- and skip empty strings consistently. Existing rows untouched.

CREATE OR REPLACE FUNCTION public.trg_validate_indian_formats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pan_re   TEXT := '^[A-Z]{5}[0-9]{4}[A-Z]$';
  v_gstin_re TEXT := '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$';
  v_pin_re   TEXT := '^[1-9][0-9]{5}$';
BEGIN
  -- PAN
  IF TG_TABLE_NAME = 'employee_details' THEN
    IF NEW.pan_number IS NOT NULL AND btrim(NEW.pan_number) <> '' THEN
      NEW.pan_number := upper(btrim(NEW.pan_number));
      IF NEW.pan_number !~ v_pan_re THEN
        RAISE EXCEPTION 'Invalid PAN format: %. Expected 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).', NEW.pan_number
          USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.pincode IS NOT NULL AND btrim(NEW.pincode) <> '' THEN
      NEW.pincode := btrim(NEW.pincode);
      IF NEW.pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid pincode: %. Expected 6 digits (first digit 1-9).', NEW.pincode
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'organization_compliance' THEN
    IF NEW.pan IS NOT NULL AND btrim(NEW.pan) <> '' THEN
      NEW.pan := upper(btrim(NEW.pan));
      IF NEW.pan !~ v_pan_re THEN
        RAISE EXCEPTION 'Invalid PAN format: %.', NEW.pan USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.gstin IS NOT NULL AND btrim(NEW.gstin) <> '' THEN
      NEW.gstin := upper(btrim(NEW.gstin));
      IF NEW.gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid GSTIN format: %.', NEW.gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.pincode IS NOT NULL AND btrim(NEW.pincode) <> '' THEN
      NEW.pincode := btrim(NEW.pincode);
      IF NEW.pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid pincode: %.', NEW.pincode USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'warehouses' THEN
    IF NEW.pincode IS NOT NULL AND btrim(NEW.pincode) <> '' THEN
      NEW.pincode := btrim(NEW.pincode);
      IF NEW.pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid pincode: %.', NEW.pincode USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invoice_settings' THEN
    IF NEW.gstin IS NOT NULL AND btrim(NEW.gstin) <> '' THEN
      NEW.gstin := upper(btrim(NEW.gstin));
      IF NEW.gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid GSTIN format: %.', NEW.gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.pincode IS NOT NULL AND btrim(NEW.pincode) <> '' THEN
      NEW.pincode := btrim(NEW.pincode);
      IF NEW.pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid pincode: %.', NEW.pincode USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.customer_gstin IS NOT NULL AND btrim(NEW.customer_gstin) <> '' THEN
      NEW.customer_gstin := upper(btrim(NEW.customer_gstin));
      IF NEW.customer_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid customer GSTIN: %.', NEW.customer_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'quotes' THEN
    IF NEW.customer_gstin IS NOT NULL AND btrim(NEW.customer_gstin) <> '' THEN
      NEW.customer_gstin := upper(btrim(NEW.customer_gstin));
      IF NEW.customer_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid customer GSTIN: %.', NEW.customer_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'e_invoices' THEN
    IF NEW.seller_gstin IS NOT NULL AND btrim(NEW.seller_gstin) <> '' THEN
      NEW.seller_gstin := upper(btrim(NEW.seller_gstin));
      IF NEW.seller_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid seller GSTIN: %.', NEW.seller_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.buyer_gstin IS NOT NULL AND btrim(NEW.buyer_gstin) <> '' THEN
      NEW.buyer_gstin := upper(btrim(NEW.buyer_gstin));
      IF NEW.buyer_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid buyer GSTIN: %.', NEW.buyer_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.seller_pincode IS NOT NULL AND btrim(NEW.seller_pincode) <> '' THEN
      NEW.seller_pincode := btrim(NEW.seller_pincode);
      IF NEW.seller_pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid seller pincode: %.', NEW.seller_pincode USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.buyer_pincode IS NOT NULL AND btrim(NEW.buyer_pincode) <> '' THEN
      NEW.buyer_pincode := btrim(NEW.buyer_pincode);
      IF NEW.buyer_pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid buyer pincode: %.', NEW.buyer_pincode USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'eway_bills' THEN
    IF NEW.from_gstin IS NOT NULL AND btrim(NEW.from_gstin) <> '' THEN
      NEW.from_gstin := upper(btrim(NEW.from_gstin));
      IF NEW.from_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid from GSTIN: %.', NEW.from_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.to_gstin IS NOT NULL AND btrim(NEW.to_gstin) <> '' THEN
      NEW.to_gstin := upper(btrim(NEW.to_gstin));
      IF NEW.to_gstin !~ v_gstin_re THEN
        RAISE EXCEPTION 'Invalid to GSTIN: %.', NEW.to_gstin USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.from_pincode IS NOT NULL AND btrim(NEW.from_pincode) <> '' THEN
      NEW.from_pincode := btrim(NEW.from_pincode);
      IF NEW.from_pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid from pincode: %.', NEW.from_pincode USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.to_pincode IS NOT NULL AND btrim(NEW.to_pincode) <> '' THEN
      NEW.to_pincode := btrim(NEW.to_pincode);
      IF NEW.to_pincode !~ v_pin_re THEN
        RAISE EXCEPTION 'Invalid to pincode: %.', NEW.to_pincode USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'employee_details', 'organization_compliance', 'warehouses',
    'invoice_settings', 'invoices', 'quotes', 'e_invoices', 'eway_bills'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_indian_formats ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_validate_indian_formats BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_validate_indian_formats()',
      t
    );
  END LOOP;
END $$;
