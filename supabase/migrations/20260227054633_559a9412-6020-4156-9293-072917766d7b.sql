-- Drop the broken trigger that references non-existent user_id column
DROP TRIGGER IF EXISTS trg_auto_org_payslip_dispute ON public.payslip_disputes;