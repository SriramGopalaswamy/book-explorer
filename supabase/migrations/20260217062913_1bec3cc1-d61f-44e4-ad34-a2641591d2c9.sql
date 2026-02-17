-- Add recipients column to memos table for the TO: field
ALTER TABLE public.memos
ADD COLUMN recipients text[] DEFAULT '{}';

-- Add a comment for clarity
COMMENT ON COLUMN public.memos.recipients IS 'Array of recipient names/emails this memo is addressed to';
