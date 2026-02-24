
-- Fix: Recreate view without SECURITY DEFINER (it's a plain view, just needs explicit security_invoker)
DROP VIEW IF EXISTS public.payroll_attendance_summary;

CREATE VIEW public.payroll_attendance_summary
WITH (security_invoker = true)
AS
SELECT
    organization_id,
    profile_id,
    date_trunc('month', attendance_date)::date AS month,
    COUNT(*) FILTER (WHERE status = 'P') AS present_days,
    COUNT(*) FILTER (WHERE status = 'HD') AS half_days,
    COUNT(*) FILTER (WHERE status = 'A') AS absent_days,
    COUNT(*) FILTER (WHERE status = 'MIS') AS missing_days,
    SUM(ot_minutes) AS total_ot_minutes,
    SUM(late_minutes) AS total_late_minutes,
    SUM(total_work_minutes) AS total_work_minutes
FROM public.attendance_daily
GROUP BY organization_id, profile_id, date_trunc('month', attendance_date);
