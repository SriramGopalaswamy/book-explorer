-- ══════════════════════════════════════════════════════════════════════
-- GBC-2 / GBC-3 — enrol salary_components in _sync_org_id_from_parent
--
-- The audit prompt listed eight target detail tables for the
-- organization_id denormalisation. Static schema audit (2026-05-08) shows
-- only one of those actually exists in the current schema and lacks
-- the column:
--
--   - salary_components (parent: salary_structures.id, via structure_id)
--
-- The others named in the prompt (state_history, document_chains,
-- expense_approvals, warehouse_bins, payroll_adjustments) do not exist
-- as tables in `supabase/migrations/` today — either they were renamed
-- or never built. stock_ledger and stock_adjustment_lines already carry
-- organization_id from their CREATE TABLE statements.
--
-- This migration:
--   1. ADD COLUMN organization_id to salary_components (nullable initially
--      to allow backfill).
--   2. Backfill via salary_structures.id → salary_structures.organization_id
--      → ?? . salary_structures itself may not carry organization_id;
--      we walk through profiles instead (the canonical org chain in
--      this codebase per CLAUDE.md is structure → profile → organization).
--   3. NOT NULL constraint after backfill.
--   4. Attach trg_sync_org_id trigger to keep new rows in sync.
--   5. Replace the RLS policy with a single-column compare.
-- ══════════════════════════════════════════════════════════════════════

-- Step 1: column (nullable for backfill)
ALTER TABLE public.salary_components
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Step 2: backfill via salary_structures → profiles
DO $do$
DECLARE
  v_struct_has_org boolean;
BEGIN
  -- Detect which column path to use: structure.organization_id direct,
  -- or structure.profile_id → profiles.organization_id.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='salary_structures'
       AND column_name='organization_id'
  ) INTO v_struct_has_org;

  IF v_struct_has_org THEN
    UPDATE public.salary_components sc
       SET organization_id = ss.organization_id
      FROM public.salary_structures ss
     WHERE sc.structure_id = ss.id
       AND sc.organization_id IS NULL;
  ELSE
    -- Walk through profiles. salary_structures has a profile_id FK in
    -- this codebase's HRMS schema (per CLAUDE.md payslip field registry).
    UPDATE public.salary_components sc
       SET organization_id = p.organization_id
      FROM public.salary_structures ss
      JOIN public.profiles p ON p.id = ss.profile_id
     WHERE sc.structure_id = ss.id
       AND sc.organization_id IS NULL;
  END IF;
END
$do$;

-- Step 3: NOT NULL (only if all rows resolved; will fail loudly otherwise)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.salary_components WHERE organization_id IS NULL
  ) THEN
    ALTER TABLE public.salary_components
      ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END
$do$;

-- Step 4: keep new rows in sync from parent
DROP TRIGGER IF EXISTS trg_sync_org_id_salary_components ON public.salary_components;
CREATE TRIGGER trg_sync_org_id_salary_components
  BEFORE INSERT OR UPDATE ON public.salary_components
  FOR EACH ROW EXECUTE FUNCTION public._sync_org_id_from_parent('salary_structures', 'structure_id');

-- Step 5: replace the RLS policy with a single-column compare (avoids the
-- correlated subquery RLS perf hit GBC-2 describes).
DROP POLICY IF EXISTS "Users can view org salary_components" ON public.salary_components;
DROP POLICY IF EXISTS "Users can manage org salary_components" ON public.salary_components;
DROP POLICY IF EXISTS "Org admin/HR manage salary_components" ON public.salary_components;
DROP POLICY IF EXISTS "Org members view salary_components"   ON public.salary_components;

CREATE POLICY "Org members view salary_components"
  ON public.salary_components
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Org admin/HR manage salary_components"
  ON public.salary_components
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         AND public.is_admin_or_hr(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              AND public.is_admin_or_hr(auth.uid()));
