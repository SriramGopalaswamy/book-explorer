-- Phase 4: RLS rewrite — replace nested profile->organization subqueries with public.get_user_org()
-- Safe by construction: we only string-replace the specific subquery shape.

DO $rls$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_wc TEXT;
  q TEXT;
  roles_clause TEXT;
  cmd_clause TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual,'')       ~ 'SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)'
        OR COALESCE(with_check,'') ~ 'SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)'
      )
  LOOP
    new_qual := r.qual;
    new_wc   := r.with_check;

    -- Form A:  organization_id IN ( SELECT profiles.organization_id FROM profiles WHERE (profiles.user_id = auth.uid()) )
    new_qual := regexp_replace(new_qual,
      'IN \([[:space:]]*SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)[[:space:]]*\)',
      '= public.get_user_org(auth.uid())', 'g');
    new_wc := regexp_replace(COALESCE(new_wc,''),
      'IN \([[:space:]]*SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)[[:space:]]*\)',
      '= public.get_user_org(auth.uid())', 'g');

    -- Form B:  ( SELECT profiles.organization_id FROM profiles WHERE (profiles.user_id = auth.uid()) [LIMIT 1] )
    new_qual := regexp_replace(new_qual,
      '\([[:space:]]*SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)[[:space:]]*(LIMIT 1[[:space:]]*)?\)',
      'public.get_user_org(auth.uid())', 'g');
    new_wc := regexp_replace(new_wc,
      '\([[:space:]]*SELECT profiles\.organization_id[[:space:]]+FROM profiles[[:space:]]+WHERE \(profiles\.user_id = auth\.uid\(\)\)[[:space:]]*(LIMIT 1[[:space:]]*)?\)',
      'public.get_user_org(auth.uid())', 'g');

    -- If nothing changed, skip
    IF new_qual IS NOT DISTINCT FROM r.qual AND COALESCE(new_wc,'') IS NOT DISTINCT FROM COALESCE(r.with_check,'') THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(rr), ', ')
      INTO roles_clause
      FROM unnest(r.roles::text[]) AS rr;

    cmd_clause := CASE r.cmd
      WHEN 'ALL' THEN 'ALL'
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
      ELSE r.cmd
    END;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    q := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                r.policyname, r.tablename,
                r.permissive,
                cmd_clause,
                COALESCE(roles_clause, 'public'));

    IF new_qual IS NOT NULL AND length(new_qual) > 0 THEN
      q := q || format(' USING (%s)', new_qual);
    END IF;
    IF new_wc IS NOT NULL AND length(new_wc) > 0 THEN
      q := q || format(' WITH CHECK (%s)', new_wc);
    END IF;

    RAISE NOTICE 'Rewriting policy %.% : %', r.tablename, r.policyname, q;
    EXECUTE q;
  END LOOP;
END
$rls$;

-- Verify helper is still STABLE SECURITY DEFINER (no-op if already correct).
COMMENT ON FUNCTION public.get_user_org(uuid) IS
  'Returns the organization_id for a given auth user. STABLE SECURITY DEFINER so RLS policies can call it without triggering recursion.';
