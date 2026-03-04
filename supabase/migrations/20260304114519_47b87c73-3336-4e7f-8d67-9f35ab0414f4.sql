
-- Now create unique indexes after cleaning duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_org 
  ON public.invoices (invoice_number, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_number_org 
  ON public.bills (bill_number, organization_id);
