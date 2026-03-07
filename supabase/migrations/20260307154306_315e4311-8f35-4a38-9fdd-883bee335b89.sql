
-- Attach the existing auto_set_eway_bill_org function as a trigger
CREATE TRIGGER trg_auto_set_eway_bill_org
  BEFORE INSERT ON public.eway_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_eway_bill_org();

-- Add Indian compliance validation trigger for eway_bills
CREATE OR REPLACE FUNCTION public.validate_eway_bill()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate GSTIN format (15 chars: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 alphanumeric + Z + 1 alphanumeric)
  IF NEW.from_gstin IS NOT NULL AND NEW.from_gstin != '' THEN
    IF NEW.from_gstin !~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$' THEN
      RAISE EXCEPTION 'Invalid From GSTIN format. Expected format: 22AAAAA0000A1Z5';
    END IF;
  END IF;

  IF NEW.to_gstin IS NOT NULL AND NEW.to_gstin != '' THEN
    IF NEW.to_gstin !~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$' THEN
      RAISE EXCEPTION 'Invalid To GSTIN format. Expected format: 22AAAAA0000A1Z5';
    END IF;
  END IF;

  -- Validate pincode (6 digits for India)
  IF NEW.from_pincode IS NOT NULL AND NEW.from_pincode != '' THEN
    IF NEW.from_pincode !~ '^\d{6}$' THEN
      RAISE EXCEPTION 'Invalid From Pincode. Must be 6 digits.';
    END IF;
  END IF;

  IF NEW.to_pincode IS NOT NULL AND NEW.to_pincode != '' THEN
    IF NEW.to_pincode !~ '^\d{6}$' THEN
      RAISE EXCEPTION 'Invalid To Pincode. Must be 6 digits.';
    END IF;
  END IF;

  -- Validate vehicle number format (Indian: AA00AA0000 or AA00A0000)
  IF NEW.vehicle_number IS NOT NULL AND NEW.vehicle_number != '' THEN
    IF NEW.vehicle_number !~ '^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$' THEN
      RAISE EXCEPTION 'Invalid Vehicle Number format. Expected: KA01AB1234';
    END IF;
  END IF;

  -- Validate state codes (01-38 for Indian states/UTs)
  IF NEW.from_state_code IS NOT NULL AND NEW.from_state_code != '' THEN
    IF NEW.from_state_code !~ '^\d{2}$' OR CAST(NEW.from_state_code AS INTEGER) < 1 OR CAST(NEW.from_state_code AS INTEGER) > 38 THEN
      RAISE EXCEPTION 'Invalid From State Code. Must be 01-38.';
    END IF;
  END IF;

  IF NEW.to_state_code IS NOT NULL AND NEW.to_state_code != '' THEN
    IF NEW.to_state_code !~ '^\d{2}$' OR CAST(NEW.to_state_code AS INTEGER) < 1 OR CAST(NEW.to_state_code AS INTEGER) > 38 THEN
      RAISE EXCEPTION 'Invalid To State Code. Must be 01-38.';
    END IF;
  END IF;

  -- HSN code validation (4, 6, or 8 digits)
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_code != '' THEN
    IF NEW.hsn_code !~ '^\d{4}$|^\d{6}$|^\d{8}$' THEN
      RAISE EXCEPTION 'Invalid HSN Code. Must be 4, 6, or 8 digits.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_eway_bill
  BEFORE INSERT OR UPDATE ON public.eway_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_eway_bill();
