-- =============================================================================
-- ADD WORKING WEEK POLICY TO EMPLOYEE PROFILES
-- =============================================================================
-- Purpose: Track employee working week policy (5 days or 6 days per week)
-- Supports: Attendance tracking and leave calculations
-- =============================================================================

-- Add working_week_policy column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS working_week_policy TEXT 
    NOT NULL DEFAULT '5_days' 
    CHECK (working_week_policy IN ('5_days', '6_days'));

-- Add index for filtering by working week policy
CREATE INDEX IF NOT EXISTS idx_profiles_working_week_policy 
ON public.profiles(working_week_policy);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.working_week_policy IS 
'Employee working week policy: 5_days (Mon-Fri) or 6_days (Mon-Sat)';

-- Update existing profiles to have default 5_days policy (can be changed later)
UPDATE public.profiles 
SET working_week_policy = '5_days' 
WHERE working_week_policy IS NULL;
