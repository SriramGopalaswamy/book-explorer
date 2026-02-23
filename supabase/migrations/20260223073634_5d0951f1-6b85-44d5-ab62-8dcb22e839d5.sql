
-- ============================================================
-- PART 1: Organization State Machine
-- ============================================================

-- 1a. Add org_state column (coexists with existing status column)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_state TEXT NOT NULL DEFAULT 'active';

-- 1b. Constraint for allowed values
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_state
  CHECK (org_state IN ('draft', 'initializing', 'active', 'locked', 'archived'));

-- 1c. Prevent hard-delete of organizations row (Safety Rule)
CREATE OR REPLACE FUNCTION public.prevent_org_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion of organizations is prohibited. Use org_state = archived instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_org_hard_delete ON public.organizations;
CREATE TRIGGER trg_prevent_org_hard_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW
  WHEN (OLD.environment_type != 'sandbox')
  EXECUTE FUNCTION public.prevent_org_hard_delete();

-- 1d. Block destructive writes when org_state = 'locked' or 'archived'
--     (extends existing block_suspended_org_writes concept)
CREATE OR REPLACE FUNCTION public.block_locked_or_archived_org_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_state text;
BEGIN
  SELECT org_state INTO _org_state
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF _org_state IN ('locked', 'archived') THEN
    RAISE EXCEPTION 'Organization is %. All write operations are blocked.', _org_state;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- PART 3: Integrity Audit Engine
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_integrity_audit(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fk_ok boolean := true;
  _rls_ok boolean := true;
  _audit_ok boolean := true;
  _txn_count bigint := 0;
  _safe_reset boolean;
  _score int := 100;
  _result jsonb;
  _missing_fk int := 0;
  _missing_rls int := 0;
  _cnt bigint;
BEGIN
  -- Only super_admins can run this
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can run integrity audit';
  END IF;

  -- FK completeness: count org-scoped tables without FK to organizations
  SELECT count(*) INTO _missing_fk
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND c.table_name NOT IN ('organizations')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = c.table_name
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'organizations'
    );

  IF _missing_fk > 0 THEN
    _fk_ok := false;
    _score := _score - (_missing_fk * 5);
  END IF;

  -- RLS validation: check all org-scoped tables have RLS enabled
  SELECT count(*) INTO _missing_rls
  FROM pg_tables pt
  JOIN information_schema.columns c
    ON c.table_schema = pt.schemaname AND c.table_name = pt.tablename
  WHERE pt.schemaname = 'public'
    AND c.column_name = 'organization_id'
    AND pt.tablename != 'organizations'
    AND pt.rowsecurity = false;

  IF _missing_rls > 0 THEN
    _rls_ok := false;
    _score := _score - (_missing_rls * 10);
  END IF;

  -- Audit log validation: verify audit_logs has org_id NOT NULL
  SELECT count(*) INTO _cnt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'audit_logs'
    AND column_name = 'organization_id'
    AND is_nullable = 'NO';

  IF _cnt = 0 THEN
    _audit_ok := false;
    _score := _score - 15;
  END IF;

  -- Transaction presence scan across key financial/operational tables
  -- Dynamic: query all org-scoped tables for row counts
  SELECT COALESCE(
    (SELECT count(*) FROM public.financial_records WHERE organization_id = _org_id), 0)
    + COALESCE(
    (SELECT count(*) FROM public.invoices WHERE organization_id = _org_id), 0)
    + COALESCE(
    (SELECT count(*) FROM public.payroll_records WHERE organization_id = _org_id), 0)
    + COALESCE(
    (SELECT count(*) FROM public.expenses WHERE organization_id = _org_id), 0)
    + COALESCE(
    (SELECT count(*) FROM public.bills WHERE organization_id = _org_id), 0)
    + COALESCE(
    (SELECT count(*) FROM public.bank_transactions WHERE organization_id = _org_id), 0)
  INTO _txn_count;

  _safe_reset := (_txn_count = 0);

  _score := GREATEST(_score, 0);

  _result := jsonb_build_object(
    'integrity_score', _score,
    'fk_ok', _fk_ok,
    'rls_ok', _rls_ok,
    'audit_ok', _audit_ok,
    'transaction_count', _txn_count,
    'safe_reset', _safe_reset,
    'missing_fk_count', _missing_fk,
    'missing_rls_count', _missing_rls,
    'org_id', _org_id
  );

  RETURN _result;
END;
$$;

-- ============================================================
-- PART 4: Controlled Reset Engine
-- ============================================================

CREATE OR REPLACE FUNCTION public.controlled_org_reinitialize(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _audit jsonb;
  _org_name text;
  _table_name text;
  _del_count bigint := 0;
  _total_deleted bigint := 0;
  _preserved_tables text[] := ARRAY[
    'organizations', 'organization_members', 'platform_roles',
    'platform_admin_logs', 'audit_logs', 'sandbox_users'
  ];
BEGIN
  -- Only super_admins
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only super_admin can reinitialize organizations';
  END IF;

  -- Verify org exists and is not a sandbox
  SELECT name INTO _org_name
  FROM public.organizations
  WHERE id = _org_id AND environment_type != 'sandbox';

  IF _org_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found or is a sandbox (use sandbox reset instead)';
  END IF;

  -- Run integrity audit first
  _audit := run_integrity_audit(_org_id);

  -- Block if transactions exist
  IF NOT (_audit->>'safe_reset')::boolean THEN
    RAISE EXCEPTION 'Cannot reinitialize: organization has % active transactions. safe_reset=false.',
      _audit->>'transaction_count';
  END IF;

  -- Set org_state to initializing (locks tenant UI)
  UPDATE public.organizations
  SET org_state = 'initializing', updated_at = now()
  WHERE id = _org_id;

  -- Dynamically delete from all org-scoped tables except preserved ones
  FOR _table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_tables pt ON pt.schemaname = 'public' AND pt.tablename = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.table_name != ALL(_preserved_tables)
    ORDER BY c.table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', _table_name)
      USING _org_id;
    GET DIAGNOSTICS _del_count = ROW_COUNT;
    _total_deleted := _total_deleted + _del_count;
  END LOOP;

  -- Log the reinitialization event
  INSERT INTO public.audit_logs (
    actor_id, organization_id, action, entity_type,
    entity_id, actor_role, metadata
  ) VALUES (
    auth.uid(), _org_id, 'ORG_REINITIALIZED', 'organization',
    _org_id, 'super_admin',
    jsonb_build_object(
      'total_rows_deleted', _total_deleted,
      'integrity_audit', _audit,
      'timestamp', now()::text
    )
  );

  -- Set org_state to draft (ready for re-onboarding)
  UPDATE public.organizations
  SET org_state = 'draft', updated_at = now()
  WHERE id = _org_id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', _org_id,
    'org_name', _org_name,
    'total_rows_deleted', _total_deleted,
    'new_state', 'draft',
    'integrity_audit', _audit
  );
END;
$$;
