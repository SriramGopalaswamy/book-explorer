
-- 1. Drop and recreate the CHECK constraint to allow 'employer_contribution'
ALTER TABLE public.compensation_components
  DROP CONSTRAINT IF EXISTS compensation_components_component_type_check;

ALTER TABLE public.compensation_components
  ADD CONSTRAINT compensation_components_component_type_check
  CHECK (component_type IN ('earning', 'deduction', 'employer_contribution'));

-- 2. Update Employer PF Contribution components for GRX10 org
UPDATE public.compensation_components
SET component_type = 'employer_contribution'
WHERE component_name = 'Employer PF Contribution'
  AND compensation_structure_id IN (
    SELECT id FROM public.compensation_structures
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  );
