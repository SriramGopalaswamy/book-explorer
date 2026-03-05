-- Drop the broken trigger that references non-existent user_id column
DROP TRIGGER IF EXISTS trg_auto_org_bulk_upload ON public.bulk_upload_history;
-- The correct trigger (trg_auto_set_org_bulk_upload using auto_set_org_from_uploader) remains