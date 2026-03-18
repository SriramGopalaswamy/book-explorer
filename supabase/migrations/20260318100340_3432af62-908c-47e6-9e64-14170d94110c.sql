-- Drop old check constraint and add one that includes 'bill_created' and 'cancelled'
ALTER TABLE public.goods_receipts DROP CONSTRAINT goods_receipts_status_check;
ALTER TABLE public.goods_receipts ADD CONSTRAINT goods_receipts_status_check 
  CHECK (status = ANY (ARRAY['draft', 'inspecting', 'accepted', 'rejected', 'bill_created', 'cancelled']));

-- Fix GRs that have bills but are still in 'accepted' status
UPDATE public.goods_receipts
SET status = 'bill_created'
WHERE status = 'accepted'
  AND id IN (
    SELECT DISTINCT goods_receipt_id 
    FROM public.bills 
    WHERE goods_receipt_id IS NOT NULL
  );