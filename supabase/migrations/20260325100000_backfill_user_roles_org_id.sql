-- Backfill organization_id on user_roles rows that were inserted without it.
--
-- Several code paths (set_role, approve_user, create_user in manage-roles and
-- both insert paths in ms365-auth) previously omitted organization_id.
-- Without it, org-scoped role queries (WHERE organization_id = ?) silently
-- return zero rows, causing permission checks (e.g. ai-agent write tools) to
-- incorrectly deny access to legitimately privileged users.
--
-- Strategy: join user_roles against organization_members on user_id to find
-- the correct org for each role row.  If a user is in exactly one org (the
-- common case) this is unambiguous.  If a user is in multiple orgs and has a
-- NULL-org role row we pick the org whose profile organization_id matches
-- (most reliable signal), falling back to the first membership found.

UPDATE public.user_roles ur
SET organization_id = COALESCE(
  -- 1st preference: org where the user's profile lives
  (
    SELECT p.organization_id
    FROM public.profiles p
    WHERE p.user_id = ur.user_id
    LIMIT 1
  ),
  -- 2nd preference: any org_membership
  (
    SELECT om.organization_id
    FROM public.organization_members om
    WHERE om.user_id = ur.user_id
    LIMIT 1
  )
)
WHERE ur.organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members om2
    WHERE om2.user_id = ur.user_id
  );
