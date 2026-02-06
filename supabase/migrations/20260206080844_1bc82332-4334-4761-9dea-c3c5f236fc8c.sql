-- Create bank_accounts table
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'Current' CHECK (account_type IN ('Current', 'Savings', 'FD', 'Credit')),
  account_number TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bank_transactions table
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scheduled_payments table for cash flow
CREATE TABLE public.scheduled_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'outflow' CHECK (payment_type IN ('inflow', 'outflow')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending', 'completed', 'cancelled')),
  category TEXT,
  recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_bank_accounts_user_id ON public.bank_accounts(user_id);
CREATE INDEX idx_bank_transactions_user_id ON public.bank_transactions(user_id);
CREATE INDEX idx_bank_transactions_account_id ON public.bank_transactions(account_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX idx_scheduled_payments_user_id ON public.scheduled_payments(user_id);
CREATE INDEX idx_scheduled_payments_due_date ON public.scheduled_payments(due_date);

-- Enable RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for bank_accounts
CREATE POLICY "Users can view their own bank accounts"
  ON public.bank_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own bank accounts"
  ON public.bank_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bank accounts"
  ON public.bank_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bank accounts"
  ON public.bank_accounts FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for bank_transactions
CREATE POLICY "Users can view their own transactions"
  ON public.bank_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own transactions"
  ON public.bank_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions"
  ON public.bank_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions"
  ON public.bank_transactions FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for scheduled_payments
CREATE POLICY "Users can view their own scheduled payments"
  ON public.scheduled_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own scheduled payments"
  ON public.scheduled_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own scheduled payments"
  ON public.scheduled_payments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own scheduled payments"
  ON public.scheduled_payments FOR DELETE USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduled_payments_updated_at
  BEFORE UPDATE ON public.scheduled_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();