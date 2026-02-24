ALTER TABLE public.memos DROP CONSTRAINT memos_status_check;
ALTER TABLE public.memos ADD CONSTRAINT memos_status_check CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'published'::text, 'rejected'::text]));

-- Also update any existing rows with old 'pending' status
UPDATE public.memos SET status = 'pending_approval' WHERE status = 'pending';