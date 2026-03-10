
-- ═══════════════════════════════════════════════════════════════════
-- FIX: Systemic RLS defect — profiles.id → profiles.user_id (41 tables)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. approval_requests ──
DROP POLICY IF EXISTS "Users can insert approval_requests in their org" ON approval_requests;
DROP POLICY IF EXISTS "Users can view approval_requests in their org" ON approval_requests;
DROP POLICY IF EXISTS "Users can update approval_requests in their org" ON approval_requests;
CREATE POLICY "Users can insert approval_requests in their org" ON approval_requests FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view approval_requests in their org" ON approval_requests FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update approval_requests in their org" ON approval_requests FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 2. bill_of_materials ──
DROP POLICY IF EXISTS "org_bom_insert" ON bill_of_materials;
DROP POLICY IF EXISTS "org_bom_select" ON bill_of_materials;
DROP POLICY IF EXISTS "org_bom_update" ON bill_of_materials;
DROP POLICY IF EXISTS "org_bom_delete" ON bill_of_materials;
CREATE POLICY "org_bom_insert" ON bill_of_materials FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bom_select" ON bill_of_materials FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bom_update" ON bill_of_materials FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bom_delete" ON bill_of_materials FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 3. bin_locations ──
DROP POLICY IF EXISTS "org_bin_insert" ON bin_locations;
DROP POLICY IF EXISTS "org_bin_select" ON bin_locations;
DROP POLICY IF EXISTS "org_bin_update" ON bin_locations;
DROP POLICY IF EXISTS "org_bin_delete" ON bin_locations;
CREATE POLICY "org_bin_insert" ON bin_locations FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bin_select" ON bin_locations FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bin_update" ON bin_locations FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_bin_delete" ON bin_locations FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 4. bom_lines ──
DROP POLICY IF EXISTS "bom_lines_insert" ON bom_lines;
DROP POLICY IF EXISTS "bom_lines_select" ON bom_lines;
DROP POLICY IF EXISTS "bom_lines_update" ON bom_lines;
DROP POLICY IF EXISTS "bom_lines_delete" ON bom_lines;
CREATE POLICY "bom_lines_insert" ON bom_lines FOR INSERT WITH CHECK (bom_id IN (SELECT id FROM bill_of_materials WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "bom_lines_select" ON bom_lines FOR SELECT USING (bom_id IN (SELECT id FROM bill_of_materials WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "bom_lines_update" ON bom_lines FOR UPDATE USING (bom_id IN (SELECT id FROM bill_of_materials WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "bom_lines_delete" ON bom_lines FOR DELETE USING (bom_id IN (SELECT id FROM bill_of_materials WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 5. connector_logs ──
DROP POLICY IF EXISTS "Users can insert connector_logs in their org" ON connector_logs;
DROP POLICY IF EXISTS "Users can view connector_logs in their org" ON connector_logs;
CREATE POLICY "Users can insert connector_logs in their org" ON connector_logs FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view connector_logs in their org" ON connector_logs FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 6. delivery_notes ──
DROP POLICY IF EXISTS "org_dn_insert" ON delivery_notes;
DROP POLICY IF EXISTS "org_dn_select" ON delivery_notes;
DROP POLICY IF EXISTS "org_dn_update" ON delivery_notes;
CREATE POLICY "org_dn_insert" ON delivery_notes FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_dn_select" ON delivery_notes FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_dn_update" ON delivery_notes FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 7. delivery_note_items ──
DROP POLICY IF EXISTS "dn_items_insert" ON delivery_note_items;
DROP POLICY IF EXISTS "dn_items_select" ON delivery_note_items;
DROP POLICY IF EXISTS "dn_items_update" ON delivery_note_items;
CREATE POLICY "dn_items_insert" ON delivery_note_items FOR INSERT WITH CHECK (delivery_note_id IN (SELECT id FROM delivery_notes WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "dn_items_select" ON delivery_note_items FOR SELECT USING (delivery_note_id IN (SELECT id FROM delivery_notes WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "dn_items_update" ON delivery_note_items FOR UPDATE USING (delivery_note_id IN (SELECT id FROM delivery_notes WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 8. eway_bills ──
DROP POLICY IF EXISTS "Users can insert own org eway_bills" ON eway_bills;
DROP POLICY IF EXISTS "Users can view own org eway_bills" ON eway_bills;
DROP POLICY IF EXISTS "Users can update own org eway_bills" ON eway_bills;
CREATE POLICY "Users can insert own org eway_bills" ON eway_bills FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view own org eway_bills" ON eway_bills FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own org eway_bills" ON eway_bills FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 9. exchange_rates ──
DROP POLICY IF EXISTS "Users can insert exchange_rates in their org" ON exchange_rates;
DROP POLICY IF EXISTS "Users can view exchange_rates in their org" ON exchange_rates;
DROP POLICY IF EXISTS "Users can update exchange_rates in their org" ON exchange_rates;
CREATE POLICY "Users can insert exchange_rates in their org" ON exchange_rates FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view exchange_rates in their org" ON exchange_rates FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update exchange_rates in their org" ON exchange_rates FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 10. finished_goods_entries ──
DROP POLICY IF EXISTS "org_fg_insert" ON finished_goods_entries;
DROP POLICY IF EXISTS "org_fg_select" ON finished_goods_entries;
DROP POLICY IF EXISTS "org_fg_update" ON finished_goods_entries;
CREATE POLICY "org_fg_insert" ON finished_goods_entries FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_fg_select" ON finished_goods_entries FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_fg_update" ON finished_goods_entries FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 11. goods_receipts ──
DROP POLICY IF EXISTS "org_gr_insert" ON goods_receipts;
DROP POLICY IF EXISTS "org_gr_select" ON goods_receipts;
DROP POLICY IF EXISTS "org_gr_update" ON goods_receipts;
CREATE POLICY "org_gr_insert" ON goods_receipts FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_gr_select" ON goods_receipts FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_gr_update" ON goods_receipts FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 12. goods_receipt_items ──
DROP POLICY IF EXISTS "gr_items_insert" ON goods_receipt_items;
DROP POLICY IF EXISTS "gr_items_select" ON goods_receipt_items;
DROP POLICY IF EXISTS "gr_items_update" ON goods_receipt_items;
CREATE POLICY "gr_items_insert" ON goods_receipt_items FOR INSERT WITH CHECK (goods_receipt_id IN (SELECT id FROM goods_receipts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "gr_items_select" ON goods_receipt_items FOR SELECT USING (goods_receipt_id IN (SELECT id FROM goods_receipts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "gr_items_update" ON goods_receipt_items FOR UPDATE USING (goods_receipt_id IN (SELECT id FROM goods_receipts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 13. gst_filing_status ──
DROP POLICY IF EXISTS "Users can insert gst_filing_status in their org" ON gst_filing_status;
DROP POLICY IF EXISTS "Users can view gst_filing_status in their org" ON gst_filing_status;
DROP POLICY IF EXISTS "Users can update gst_filing_status in their org" ON gst_filing_status;
CREATE POLICY "Users can insert gst_filing_status in their org" ON gst_filing_status FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view gst_filing_status in their org" ON gst_filing_status FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update gst_filing_status in their org" ON gst_filing_status FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 14. integrations ──
DROP POLICY IF EXISTS "Users can insert integrations in their org" ON integrations;
DROP POLICY IF EXISTS "Users can view integrations in their org" ON integrations;
DROP POLICY IF EXISTS "Users can update integrations in their org" ON integrations;
DROP POLICY IF EXISTS "Users can delete integrations in their org" ON integrations;
CREATE POLICY "Users can insert integrations in their org" ON integrations FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view integrations in their org" ON integrations FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update integrations in their org" ON integrations FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete integrations in their org" ON integrations FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 15. inventory_counts ──
DROP POLICY IF EXISTS "org_ic_insert" ON inventory_counts;
DROP POLICY IF EXISTS "org_ic_select" ON inventory_counts;
DROP POLICY IF EXISTS "org_ic_update" ON inventory_counts;
CREATE POLICY "org_ic_insert" ON inventory_counts FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_ic_select" ON inventory_counts FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_ic_update" ON inventory_counts FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 16. inventory_count_items (FK = count_id) ──
DROP POLICY IF EXISTS "ic_items_insert" ON inventory_count_items;
DROP POLICY IF EXISTS "ic_items_select" ON inventory_count_items;
DROP POLICY IF EXISTS "ic_items_update" ON inventory_count_items;
CREATE POLICY "ic_items_insert" ON inventory_count_items FOR INSERT WITH CHECK (count_id IN (SELECT id FROM inventory_counts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "ic_items_select" ON inventory_count_items FOR SELECT USING (count_id IN (SELECT id FROM inventory_counts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "ic_items_update" ON inventory_count_items FOR UPDATE USING (count_id IN (SELECT id FROM inventory_counts WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 17. items ──
DROP POLICY IF EXISTS "Admins can manage items" ON items;
DROP POLICY IF EXISTS "Users can view own org items" ON items;
CREATE POLICY "Admins can manage items" ON items FOR ALL USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view own org items" ON items FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 18. material_consumption ──
DROP POLICY IF EXISTS "org_mc_insert" ON material_consumption;
DROP POLICY IF EXISTS "org_mc_select" ON material_consumption;
DROP POLICY IF EXISTS "org_mc_update" ON material_consumption;
CREATE POLICY "org_mc_insert" ON material_consumption FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_mc_select" ON material_consumption FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_mc_update" ON material_consumption FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 19. payment_receipts ──
DROP POLICY IF EXISTS "Users can insert payment_receipts in their org" ON payment_receipts;
DROP POLICY IF EXISTS "Users can view payment_receipts in their org" ON payment_receipts;
DROP POLICY IF EXISTS "Users can update payment_receipts in their org" ON payment_receipts;
CREATE POLICY "Users can insert payment_receipts in their org" ON payment_receipts FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view payment_receipts in their org" ON payment_receipts FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update payment_receipts in their org" ON payment_receipts FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 20. picking_lists ──
DROP POLICY IF EXISTS "org_pl_insert" ON picking_lists;
DROP POLICY IF EXISTS "org_pl_select" ON picking_lists;
DROP POLICY IF EXISTS "org_pl_update" ON picking_lists;
CREATE POLICY "org_pl_insert" ON picking_lists FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_pl_select" ON picking_lists FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_pl_update" ON picking_lists FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 21. picking_list_items ──
DROP POLICY IF EXISTS "pl_items_insert" ON picking_list_items;
DROP POLICY IF EXISTS "pl_items_select" ON picking_list_items;
DROP POLICY IF EXISTS "pl_items_update" ON picking_list_items;
CREATE POLICY "pl_items_insert" ON picking_list_items FOR INSERT WITH CHECK (picking_list_id IN (SELECT id FROM picking_lists WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "pl_items_select" ON picking_list_items FOR SELECT USING (picking_list_id IN (SELECT id FROM picking_lists WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "pl_items_update" ON picking_list_items FOR UPDATE USING (picking_list_id IN (SELECT id FROM picking_lists WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 22. purchase_orders ──
DROP POLICY IF EXISTS "org_po_insert" ON purchase_orders;
DROP POLICY IF EXISTS "org_po_select" ON purchase_orders;
DROP POLICY IF EXISTS "org_po_update" ON purchase_orders;
DROP POLICY IF EXISTS "org_po_delete" ON purchase_orders;
CREATE POLICY "org_po_insert" ON purchase_orders FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_po_select" ON purchase_orders FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_po_update" ON purchase_orders FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_po_delete" ON purchase_orders FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 23. purchase_order_items ──
DROP POLICY IF EXISTS "po_items_insert" ON purchase_order_items;
DROP POLICY IF EXISTS "po_items_select" ON purchase_order_items;
DROP POLICY IF EXISTS "po_items_update" ON purchase_order_items;
DROP POLICY IF EXISTS "po_items_delete" ON purchase_order_items;
CREATE POLICY "po_items_insert" ON purchase_order_items FOR INSERT WITH CHECK (purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "po_items_select" ON purchase_order_items FOR SELECT USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "po_items_update" ON purchase_order_items FOR UPDATE USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "po_items_delete" ON purchase_order_items FOR DELETE USING (purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 24. purchase_returns ──
DROP POLICY IF EXISTS "Users can insert purchase_returns in their org" ON purchase_returns;
DROP POLICY IF EXISTS "Users can view purchase_returns in their org" ON purchase_returns;
DROP POLICY IF EXISTS "Users can update purchase_returns in their org" ON purchase_returns;
CREATE POLICY "Users can insert purchase_returns in their org" ON purchase_returns FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view purchase_returns in their org" ON purchase_returns FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update purchase_returns in their org" ON purchase_returns FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 25. purchase_return_items ──
DROP POLICY IF EXISTS "pr_items_insert" ON purchase_return_items;
DROP POLICY IF EXISTS "pr_items_select" ON purchase_return_items;
DROP POLICY IF EXISTS "pr_items_update" ON purchase_return_items;
CREATE POLICY "pr_items_insert" ON purchase_return_items FOR INSERT WITH CHECK (purchase_return_id IN (SELECT id FROM purchase_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "pr_items_select" ON purchase_return_items FOR SELECT USING (purchase_return_id IN (SELECT id FROM purchase_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "pr_items_update" ON purchase_return_items FOR UPDATE USING (purchase_return_id IN (SELECT id FROM purchase_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 26. sales_orders ──
DROP POLICY IF EXISTS "org_so_insert" ON sales_orders;
DROP POLICY IF EXISTS "org_so_select" ON sales_orders;
DROP POLICY IF EXISTS "org_so_update" ON sales_orders;
DROP POLICY IF EXISTS "org_so_delete" ON sales_orders;
CREATE POLICY "org_so_insert" ON sales_orders FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_so_select" ON sales_orders FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_so_update" ON sales_orders FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_so_delete" ON sales_orders FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 27. sales_order_items ──
DROP POLICY IF EXISTS "so_items_insert" ON sales_order_items;
DROP POLICY IF EXISTS "so_items_select" ON sales_order_items;
DROP POLICY IF EXISTS "so_items_update" ON sales_order_items;
DROP POLICY IF EXISTS "so_items_delete" ON sales_order_items;
CREATE POLICY "so_items_insert" ON sales_order_items FOR INSERT WITH CHECK (sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "so_items_select" ON sales_order_items FOR SELECT USING (sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "so_items_update" ON sales_order_items FOR UPDATE USING (sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "so_items_delete" ON sales_order_items FOR DELETE USING (sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 28. sales_returns ──
DROP POLICY IF EXISTS "Users can insert sales_returns in their org" ON sales_returns;
DROP POLICY IF EXISTS "Users can view sales_returns in their org" ON sales_returns;
DROP POLICY IF EXISTS "Users can update sales_returns in their org" ON sales_returns;
CREATE POLICY "Users can insert sales_returns in their org" ON sales_returns FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view sales_returns in their org" ON sales_returns FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update sales_returns in their org" ON sales_returns FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 29. sales_return_items ──
DROP POLICY IF EXISTS "sr_items_insert" ON sales_return_items;
DROP POLICY IF EXISTS "sr_items_select" ON sales_return_items;
DROP POLICY IF EXISTS "sr_items_update" ON sales_return_items;
CREATE POLICY "sr_items_insert" ON sales_return_items FOR INSERT WITH CHECK (sales_return_id IN (SELECT id FROM sales_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "sr_items_select" ON sales_return_items FOR SELECT USING (sales_return_id IN (SELECT id FROM sales_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "sr_items_update" ON sales_return_items FOR UPDATE USING (sales_return_id IN (SELECT id FROM sales_returns WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 30. shopify_customers ──
DROP POLICY IF EXISTS "Users can view shopify_customers in their org" ON shopify_customers;
DROP POLICY IF EXISTS "Users can insert shopify_customers in their org" ON shopify_customers;
CREATE POLICY "Users can view shopify_customers in their org" ON shopify_customers FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert shopify_customers in their org" ON shopify_customers FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 31. shopify_orders ──
DROP POLICY IF EXISTS "Users can view shopify_orders in their org" ON shopify_orders;
DROP POLICY IF EXISTS "Users can insert shopify_orders in their org" ON shopify_orders;
CREATE POLICY "Users can view shopify_orders in their org" ON shopify_orders FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert shopify_orders in their org" ON shopify_orders FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 32. shopify_products ──
DROP POLICY IF EXISTS "Users can view shopify_products in their org" ON shopify_products;
DROP POLICY IF EXISTS "Users can insert shopify_products in their org" ON shopify_products;
CREATE POLICY "Users can view shopify_products in their org" ON shopify_products FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert shopify_products in their org" ON shopify_products FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 33. stock_adjustments ──
DROP POLICY IF EXISTS "org_sa_insert" ON stock_adjustments;
DROP POLICY IF EXISTS "org_sa_select" ON stock_adjustments;
DROP POLICY IF EXISTS "org_sa_update" ON stock_adjustments;
CREATE POLICY "org_sa_insert" ON stock_adjustments FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_sa_select" ON stock_adjustments FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_sa_update" ON stock_adjustments FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 34. stock_adjustment_items (FK = adjustment_id) ──
DROP POLICY IF EXISTS "sa_items_insert" ON stock_adjustment_items;
DROP POLICY IF EXISTS "sa_items_select" ON stock_adjustment_items;
DROP POLICY IF EXISTS "sa_items_update" ON stock_adjustment_items;
CREATE POLICY "sa_items_insert" ON stock_adjustment_items FOR INSERT WITH CHECK (adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "sa_items_select" ON stock_adjustment_items FOR SELECT USING (adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "sa_items_update" ON stock_adjustment_items FOR UPDATE USING (adjustment_id IN (SELECT id FROM stock_adjustments WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 35. stock_ledger ──
DROP POLICY IF EXISTS "org_sl_select" ON stock_ledger;
DROP POLICY IF EXISTS "org_sl_insert" ON stock_ledger;
CREATE POLICY "org_sl_select" ON stock_ledger FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_sl_insert" ON stock_ledger FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 36. stock_transfers ──
DROP POLICY IF EXISTS "org_st_insert" ON stock_transfers;
DROP POLICY IF EXISTS "org_st_select" ON stock_transfers;
DROP POLICY IF EXISTS "org_st_update" ON stock_transfers;
CREATE POLICY "org_st_insert" ON stock_transfers FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_st_select" ON stock_transfers FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_st_update" ON stock_transfers FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 37. stock_transfer_items (FK = transfer_id) ──
DROP POLICY IF EXISTS "st_items_insert" ON stock_transfer_items;
DROP POLICY IF EXISTS "st_items_select" ON stock_transfer_items;
DROP POLICY IF EXISTS "st_items_update" ON stock_transfer_items;
CREATE POLICY "st_items_insert" ON stock_transfer_items FOR INSERT WITH CHECK (transfer_id IN (SELECT id FROM stock_transfers WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "st_items_select" ON stock_transfer_items FOR SELECT USING (transfer_id IN (SELECT id FROM stock_transfers WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));
CREATE POLICY "st_items_update" ON stock_transfer_items FOR UPDATE USING (transfer_id IN (SELECT id FROM stock_transfers WHERE organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())));

-- ── 38. units_of_measure ──
DROP POLICY IF EXISTS "org_uom_insert" ON units_of_measure;
DROP POLICY IF EXISTS "org_uom_select" ON units_of_measure;
DROP POLICY IF EXISTS "org_uom_update" ON units_of_measure;
CREATE POLICY "org_uom_insert" ON units_of_measure FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_uom_select" ON units_of_measure FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_uom_update" ON units_of_measure FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 39. vendor_payments ──
DROP POLICY IF EXISTS "Users can insert vendor_payments in their org" ON vendor_payments;
DROP POLICY IF EXISTS "Users can view vendor_payments in their org" ON vendor_payments;
DROP POLICY IF EXISTS "Users can update vendor_payments in their org" ON vendor_payments;
CREATE POLICY "Users can insert vendor_payments in their org" ON vendor_payments FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can view vendor_payments in their org" ON vendor_payments FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update vendor_payments in their org" ON vendor_payments FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 40. warehouses ──
DROP POLICY IF EXISTS "org_wh_insert" ON warehouses;
DROP POLICY IF EXISTS "org_wh_select" ON warehouses;
DROP POLICY IF EXISTS "org_wh_update" ON warehouses;
DROP POLICY IF EXISTS "org_wh_delete" ON warehouses;
CREATE POLICY "org_wh_insert" ON warehouses FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_wh_select" ON warehouses FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_wh_update" ON warehouses FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_wh_delete" ON warehouses FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ── 41. work_orders ──
DROP POLICY IF EXISTS "org_wo_insert" ON work_orders;
DROP POLICY IF EXISTS "org_wo_select" ON work_orders;
DROP POLICY IF EXISTS "org_wo_update" ON work_orders;
CREATE POLICY "org_wo_insert" ON work_orders FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_wo_select" ON work_orders FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "org_wo_update" ON work_orders FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
