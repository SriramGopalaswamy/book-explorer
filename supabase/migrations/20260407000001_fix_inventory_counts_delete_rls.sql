-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Missing RLS DELETE policy for inventory_counts.
--
-- Migration 20260306130038 added SELECT/INSERT/UPDATE policies for this
-- table but omitted a DELETE policy.  Migration 20260310062032 recreated
-- those same three policies but still omitted DELETE.
--
-- Without a permissive DELETE policy, Supabase evaluates no matching
-- policy → the operation is silently blocked → the client receives
-- {error: null, data: []} → the frontend shows "Count deleted" but the
-- row is never removed.
--
-- NOTE: inventory_count_lines already has a DELETE policy
-- (added in migration 20260312132959) and its FK references
-- inventory_counts(id) ON DELETE CASCADE, so once the parent row can
-- actually be deleted, child lines are removed automatically by the DB.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org_ic_delete" ON public.inventory_counts;

CREATE POLICY "org_ic_delete" ON public.inventory_counts
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );
