-- Fix payroll_records where profile_id points to mohammed's profile but user_id is stale
UPDATE public.payroll_records
SET user_id = '7237583f-86d3-400f-a35b-0ca7ae240406'
WHERE profile_id = '178c42a7-5a21-460b-8f53-e890ab6a8301'
  AND user_id != '7237583f-86d3-400f-a35b-0ca7ae240406';
