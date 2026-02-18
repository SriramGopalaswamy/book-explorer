
-- ─── Goal Plans Table ─────────────────────────────────────────────────────────
-- Stores one plan per employee per month.
-- Items are stored as a JSONB array for atomic updates.
-- Each item: { id, client, bucket, line_item, weightage, target, actual }

CREATE TABLE public.goal_plans (
  id              uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid    NOT NULL,
  profile_id      uuid    REFERENCES public.profiles(id) ON DELETE SET NULL,
  month           date    NOT NULL, -- always first day of month e.g. 2025-03-01
  status          text    NOT NULL DEFAULT 'draft',
  items           jsonb   NOT NULL DEFAULT '[]'::jsonb,
  reviewer_notes  text,
  reviewed_by     uuid,
  reviewed_at     timestamp with time zone,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT goal_plans_user_month_unique UNIQUE (user_id, month),
  CONSTRAINT goal_plans_status_check CHECK (
    status IN ('draft','pending_approval','approved','rejected',
               'pending_edit_approval','pending_score_approval','completed')
  )
);

-- Auto-update updated_at
CREATE TRIGGER update_goal_plans_updated_at
  BEFORE UPDATE ON public.goal_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.goal_plans ENABLE ROW LEVEL SECURITY;

-- Employees: view their own plans
CREATE POLICY "Users can view own goal plans"
  ON public.goal_plans FOR SELECT
  USING (auth.uid() = user_id);

-- Employees: create their own plans
CREATE POLICY "Users can create own goal plans"
  ON public.goal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Employees: update their own plans (status transitions handled in app logic)
CREATE POLICY "Users can update own goal plans"
  ON public.goal_plans FOR UPDATE
  USING (auth.uid() = user_id);

-- Employees: delete only their own DRAFT plans
CREATE POLICY "Users can delete own draft goal plans"
  ON public.goal_plans FOR DELETE
  USING (auth.uid() = user_id AND status = 'draft');

-- Managers/HR/Admin: view all goal plans from their reports
CREATE POLICY "Managers HR Admin can view all goal plans"
  ON public.goal_plans FOR SELECT
  USING (is_admin_hr_or_manager(auth.uid()));

-- Managers/HR/Admin: update any goal plan (for approvals + edits during review)
CREATE POLICY "Managers HR Admin can update goal plans"
  ON public.goal_plans FOR UPDATE
  USING (is_admin_hr_or_manager(auth.uid()));
