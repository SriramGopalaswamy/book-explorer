-- Allow deleting picking_list_items for own org
CREATE POLICY pl_items_delete ON public.picking_list_items
  FOR DELETE TO authenticated
  USING (picking_list_id IN (
    SELECT id FROM picking_lists
    WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid()
    )
  ));

-- Allow deleting picking_lists for own org
CREATE POLICY org_pl_delete ON public.picking_lists
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  ));