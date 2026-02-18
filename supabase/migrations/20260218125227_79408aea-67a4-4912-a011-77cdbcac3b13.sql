
-- ============================================================
-- FINANCIAL SUITE EXPANSION: Customers, Vendors, Quotes,
-- Expenses, Bills, Credit Notes, Vendor Credits, Credit Cards
-- ============================================================

-- 1. CUSTOMERS
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  tax_number TEXT,
  contact_person TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage customers"
  ON public.customers FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view customers"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id);

-- 2. VENDORS
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  tax_number TEXT,
  contact_person TEXT,
  payment_terms TEXT DEFAULT '30 days',
  bank_account TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage vendors"
  ON public.vendors FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view vendors"
  ON public.vendors FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Add customer_id FK to invoices (nullable to keep backward compat)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 4. QUOTES
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  rate NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quotes"
  ON public.quotes FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their quote items"
  ON public.quote_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.quotes WHERE quotes.id = quote_items.quote_id AND quotes.user_id = auth.uid()));

-- 5. EXPENSES
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage all expenses"
  ON public.expenses FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view own expenses"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. BILLS (vendor invoices)
CREATE TABLE public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  bill_number TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  attachment_url TEXT,
  notes TEXT,
  ai_extracted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.bill_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  rate NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage bills"
  ON public.bills FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view bills"
  ON public.bills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage bill items"
  ON public.bill_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()));

-- 7. CREDIT NOTES (against customers)
CREATE TABLE public.credit_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  credit_note_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage credit notes"
  ON public.credit_notes FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view credit notes"
  ON public.credit_notes FOR SELECT
  USING (auth.uid() = user_id);

-- 8. VENDOR CREDITS (against vendors)
CREATE TABLE public.vendor_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
  vendor_credit_number TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and admin can manage vendor credits"
  ON public.vendor_credits FOR ALL
  USING (is_admin_or_finance(auth.uid()));

CREATE POLICY "Users can view vendor credits"
  ON public.vendor_credits FOR SELECT
  USING (auth.uid() = user_id);

-- 9. CREDIT CARDS
CREATE TABLE public.credit_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_name TEXT NOT NULL,
  card_last_four TEXT,
  card_network TEXT,
  credit_limit NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  payment_due_date INTEGER, -- day of month
  bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_card_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'uncategorised',
  ai_suggested_category TEXT,
  ai_match_id UUID,
  ai_match_type TEXT,
  is_duplicate_flag BOOLEAN DEFAULT false,
  reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own credit cards"
  ON public.credit_cards FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own credit card transactions"
  ON public.credit_card_transactions FOR ALL
  USING (auth.uid() = user_id);

-- 10. BANK STATEMENT RECONCILIATION
ALTER TABLE public.bank_transactions 
  ADD COLUMN IF NOT EXISTS reconcile_status TEXT DEFAULT 'uncategorised',
  ADD COLUMN IF NOT EXISTS ai_suggested_category TEXT,
  ADD COLUMN IF NOT EXISTS ai_match_id UUID,
  ADD COLUMN IF NOT EXISTS ai_match_type TEXT,
  ADD COLUMN IF NOT EXISTS is_duplicate_flag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP WITH TIME ZONE;

-- 11. Storage bucket for bill attachments and credit card statements
INSERT INTO storage.buckets (id, name, public) 
VALUES ('bill-attachments', 'bill-attachments', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('credit-card-statements', 'credit-card-statements', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users can upload bill attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bill-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can view bill attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bill-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can upload credit card statements"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'credit-card-statements' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can view credit card statements"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'credit-card-statements' AND auth.uid() IS NOT NULL);

-- 12. Updated_at triggers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_credit_notes_updated_at BEFORE UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_credits_updated_at BEFORE UPDATE ON public.vendor_credits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_credit_cards_updated_at BEFORE UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
