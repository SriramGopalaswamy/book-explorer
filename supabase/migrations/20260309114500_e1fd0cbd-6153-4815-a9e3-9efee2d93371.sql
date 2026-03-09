
-- Create a dedicated trigger function for tables that use created_by instead of user_id
CREATE OR REPLACE FUNCTION public.auto_set_org_from_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.organization_id := get_user_organization_id(NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

-- Replace triggers on the 4 affected tables
DROP TRIGGER IF EXISTS set_vendor_payments_org ON public.vendor_payments;
CREATE TRIGGER set_vendor_payments_org
  BEFORE INSERT ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_from_created_by();

DROP TRIGGER IF EXISTS set_payment_receipts_org ON public.payment_receipts;
CREATE TRIGGER set_payment_receipts_org
  BEFORE INSERT ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_from_created_by();

DROP TRIGGER IF EXISTS set_purchase_returns_org ON public.purchase_returns;
CREATE TRIGGER set_purchase_returns_org
  BEFORE INSERT ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_from_created_by();

DROP TRIGGER IF EXISTS set_sales_returns_org ON public.sales_returns;
CREATE TRIGGER set_sales_returns_org
  BEFORE INSERT ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_from_created_by();
