BEGIN;

-- GBC-151: Dropdown and search-as-you-type hooks use `ilike '%q%'` (substring
-- match) on name/email columns. Without pg_trgm indexes this is a full table
-- scan on every keystroke. These GIN trigram indexes enable substring ilike to
-- use an index, keeping search fast as data grows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Employees search (full_name, email, employee_id)
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm
  ON public.profiles USING gin (full_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
  ON public.profiles USING gin (email gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Invoice search (invoice_number, client_name, client_email)
CREATE INDEX IF NOT EXISTS idx_invoices_client_name_trgm
  ON public.invoices USING gin (client_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Purchase order search (po_number, vendor_name)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_name_trgm
  ON public.purchase_orders USING gin (vendor_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Items dropdown (name)
CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON public.items USING gin (name gin_trgm_ops)
  WHERE is_active = true;

COMMIT;
