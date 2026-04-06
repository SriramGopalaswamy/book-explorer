-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Missing RLS DELETE policies for stock_adjustments,
--      stock_adjustment_items, goods_receipts, goods_receipt_items.
--
-- Migration 20260310062032 added INSERT/SELECT/UPDATE policies for these
-- tables but omitted DELETE policies entirely.  As a result, Supabase
-- evaluates no permissive policy for DELETE → the operation is silently
-- blocked at the DB level while the client receives no error object →
-- the frontend shows a success toast but the row is never removed.
-- ═══════════════════════════════════════════════════════════════════════

-- ── stock_adjustments ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_sa_delete" ON stock_adjustments;
CREATE POLICY "org_sa_delete" ON stock_adjustments
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ── stock_adjustment_items ───────────────────────────────────────────────
DROP POLICY IF EXISTS "sa_items_delete" ON stock_adjustment_items;
CREATE POLICY "sa_items_delete" ON stock_adjustment_items
  FOR DELETE USING (
    adjustment_id IN (
      SELECT id FROM stock_adjustments
      WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- ── goods_receipts ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_gr_delete" ON goods_receipts;
CREATE POLICY "org_gr_delete" ON goods_receipts
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ── goods_receipt_items ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "gr_items_delete" ON goods_receipt_items;
CREATE POLICY "gr_items_delete" ON goods_receipt_items
  FOR DELETE USING (
    goods_receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );
