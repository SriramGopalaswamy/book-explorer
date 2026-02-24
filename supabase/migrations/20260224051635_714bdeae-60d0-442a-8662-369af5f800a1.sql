
-- Add approval tracking columns to expenses
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id);

-- Backfill profile_id from user_id for existing rows
UPDATE public.expenses e
SET profile_id = p.id
FROM public.profiles p
WHERE p.user_id = e.user_id
  AND e.profile_id IS NULL;

-- Create trigger to auto-populate profile_id on insert
CREATE OR REPLACE FUNCTION public.auto_set_expense_profile_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.profile_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.profile_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_profile_id
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_expense_profile_id();

-- Add RLS policy: Managers can view and update expenses of their direct reports
CREATE POLICY "Managers can view direct reports expenses"
ON public.expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = expenses.profile_id
      AND p.manager_id = auth.uid()
  )
);

CREATE POLICY "Managers can update direct reports expenses"
ON public.expenses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = expenses.profile_id
      AND p.manager_id = auth.uid()
  )
);

-- Allow employees and managers to insert their own expenses (not just finance)
-- The existing "Users can create own expenses" policy already covers this
