-- ═══════════════════════════════════════════════════════════════════════
-- Fix: Remove 'Employer PF Contribution' from earning components.
--
-- Root cause: The initial payroll setup inserted 'Employer PF Contribution'
-- as component_type = 'earning', causing the payroll engine to include it
-- in gross_earnings. Employer PF is a company cost (part of CTC) — it must
-- NOT appear as an employee earning or it inflates the employee's gross salary.
--
-- After this migration + payroll regeneration:
--   Gross = Basic + HRA + Other Allowance  (no employer PF)
--   CTC (annual_ctc field) is unchanged — it still reflects total employer cost
-- ═══════════════════════════════════════════════════════════════════════

DELETE FROM public.compensation_components cc
USING public.compensation_structures cs
WHERE cc.compensation_structure_id = cs.id
  AND cs.organization_id = '00000000-0000-0000-0000-000000000001'
  AND cc.component_name = 'Employer PF Contribution'
  AND cc.component_type = 'earning';
-- Expected: DELETE 36 (one per active compensation structure)
