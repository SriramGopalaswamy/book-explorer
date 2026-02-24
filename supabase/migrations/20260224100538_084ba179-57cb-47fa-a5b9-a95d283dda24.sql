-- Add 'pending_hr_approval' to the goal_plans status check constraint
ALTER TABLE public.goal_plans DROP CONSTRAINT goal_plans_status_check;
ALTER TABLE public.goal_plans ADD CONSTRAINT goal_plans_status_check CHECK (status = ANY (ARRAY['draft', 'pending_approval', 'approved', 'rejected', 'pending_edit_approval', 'pending_score_approval', 'pending_hr_approval', 'completed']));