-- ═══════════════════════════════════════════════════════════════════════
-- Fix: Keep 'Employer PF Contribution' visible in CTC breakdown but
--      exclude it from the employee's gross earnings.
--
-- Root cause: The initial setup inserted it as component_type = 'earning',
-- causing the payroll engine to sum it into grossEarnings. Employer PF is a
-- company cost — it is part of CTC but must NOT be part of the employee's
-- gross salary on payslip.
--
-- Approach:
--   1. Add 'employer_contribution' as a valid component_type value.
--   2. Reclassify 'Employer PF Contribution' components to that new type.
--   The payroll engine is also updated to push employer_contribution items
--   into earningsBreakdown (CTC visibility) WITHOUT adding to grossEarnings.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Widen the CHECK constraint to allow the new type.
ALTER TABLE public.compensation_components
  DROP CONSTRAINT IF EXISTS compensation_components_component_type_check;

ALTER TABLE public.compensation_components
  ADD CONSTRAINT compensation_components_component_type_check
  CHECK (component_type IN ('earning', 'deduction', 'employer_contribution'));

-- 2. Reclassify all 'Employer PF Contribution' earning components for this org.
UPDATE public.compensation_components cc
SET component_type = 'employer_contribution'
FROM public.compensation_structures cs
WHERE cc.compensation_structure_id = cs.id
  AND cs.organization_id = '00000000-0000-0000-0000-000000000001'
  AND cc.component_name = 'Employer PF Contribution'
  AND cc.component_type = 'earning';
-- Expected: UPDATE 36 (one per active compensation structure)
