-- Add optimistic locking version column to invoices table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
