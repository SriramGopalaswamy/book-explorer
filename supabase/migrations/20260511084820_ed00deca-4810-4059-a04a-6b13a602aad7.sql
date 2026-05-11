-- Full-text search columns + GIN indexes on the 8 audit-target tables.
-- Generated STORED columns auto-maintain the tsvector on insert/update.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(invoice_number,'') || ' ' ||
      coalesce(client_name,'')    || ' ' ||
      coalesce(client_email,'')   || ' ' ||
      coalesce(notes,'')          || ' ' ||
      coalesce(customer_gstin,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_invoices_search_vector
  ON public.invoices USING GIN (search_vector);

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(bill_number,'') || ' ' ||
      coalesce(vendor_name,'') || ' ' ||
      coalesce(notes,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_bills_search_vector
  ON public.bills USING GIN (search_vector);

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(memo,'')                      || ' ' ||
      coalesce(document_sequence_number,'')  || ' ' ||
      coalesce(source_type,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_journal_entries_search_vector
  ON public.journal_entries USING GIN (search_vector);

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(description,'') || ' ' ||
      coalesce(reference,'')   || ' ' ||
      coalesce(category,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_search_vector
  ON public.bank_transactions USING GIN (search_vector);

ALTER TABLE public.eway_bills
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(eway_bill_number,'') || ' ' ||
      coalesce(document_number,'')  || ' ' ||
      coalesce(from_name,'')        || ' ' ||
      coalesce(to_name,'')          || ' ' ||
      coalesce(product_name,'')     || ' ' ||
      coalesce(vehicle_number,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_eway_bills_search_vector
  ON public.eway_bills USING GIN (search_vector);

ALTER TABLE public.stock_ledger
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(reference_type,'') || ' ' ||
      coalesce(batch_no,'')       || ' ' ||
      coalesce(serial_no,'')      || ' ' ||
      coalesce(notes,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_stock_ledger_search_vector
  ON public.stock_ledger USING GIN (search_vector);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(action,'')       || ' ' ||
      coalesce(entity_type,'')  || ' ' ||
      coalesce(actor_name,'')   || ' ' ||
      coalesce(target_name,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_audit_logs_search_vector
  ON public.audit_logs USING GIN (search_vector);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(so_number,'')     || ' ' ||
      coalesce(customer_name,'') || ' ' ||
      coalesce(notes,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_sales_orders_search_vector
  ON public.sales_orders USING GIN (search_vector);