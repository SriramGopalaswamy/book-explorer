
-- Drop misapplied auto_set_organization_id triggers from tables that don't have user_id
DROP TRIGGER IF EXISTS trg_auto_set_org_audit_logs ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_auto_org_audit_logs ON public.audit_logs;

-- Also fix the same issue on other tables without user_id
DROP TRIGGER IF EXISTS trg_auto_set_org_holidays ON public.holidays;
DROP TRIGGER IF EXISTS trg_auto_org_holidays ON public.holidays;
DROP TRIGGER IF EXISTS trg_auto_set_org_bulk_upload_history ON public.bulk_upload_history;
DROP TRIGGER IF EXISTS trg_auto_org_bulk_upload_history ON public.bulk_upload_history;
