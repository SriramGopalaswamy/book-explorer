
-- When a customer's details are updated, sync name/email to all DRAFT invoices
-- linked to that customer. Sent/paid/overdue invoices remain unchanged (frozen snapshot).

CREATE OR REPLACE FUNCTION public.sync_customer_to_draft_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when name or email actually changed
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.invoices
    SET
      client_name = NEW.name,
      client_email = COALESCE(NEW.email, client_email),
      updated_at = now()
    WHERE customer_id = NEW.id
      AND status = 'draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_to_draft_invoices ON public.customers;
CREATE TRIGGER trg_sync_customer_to_draft_invoices
  AFTER UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_to_draft_invoices();

-- Also sync to draft quotes and draft credit notes
CREATE OR REPLACE FUNCTION public.sync_customer_to_draft_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.quotes
    SET
      client_name = NEW.name,
      client_email = COALESCE(NEW.email, client_email),
      updated_at = now()
    WHERE customer_id = NEW.id
      AND status = 'draft';

    UPDATE public.credit_notes
    SET
      client_name = NEW.name,
      updated_at = now()
    WHERE customer_id = NEW.id
      AND status = 'draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_to_draft_quotes ON public.customers;
CREATE TRIGGER trg_sync_customer_to_draft_quotes
  AFTER UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_to_draft_quotes();
