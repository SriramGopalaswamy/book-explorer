
CREATE OR REPLACE FUNCTION public._sync_org_id_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_parent_fk    text := TG_ARGV[1];
  v_parent_org   uuid;
  v_fk_value     uuid;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_parent_fk) INTO v_fk_value USING NEW;
  IF v_fk_value IS NULL THEN RETURN NEW; END IF;

  EXECUTE format('SELECT organization_id FROM public.%I WHERE id = $1', v_parent_table)
    INTO v_parent_org USING v_fk_value;

  IF v_parent_org IS NULL THEN
    RAISE EXCEPTION 'Parent % row % has null organization_id', v_parent_table, v_fk_value;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_parent_org;
  ELSIF NEW.organization_id <> v_parent_org THEN
    RAISE EXCEPTION 'organization_id mismatch with parent % (% vs %)',
      v_parent_table, NEW.organization_id, v_parent_org;
  END IF;
  RETURN NEW;
END;
$$;

DO $do$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('delivery_note_items',      'delivery_notes',     'delivery_note_id'),
      ('goods_receipt_items',      'goods_receipts',     'goods_receipt_id'),
      ('journal_lines',            'journal_entries',    'journal_entry_id'),
      ('picking_list_items',       'picking_lists',      'picking_list_id'),
      ('purchase_order_items',     'purchase_orders',    'purchase_order_id'),
      ('quote_items',              'quotes',             'quote_id'),
      ('sales_order_items',        'sales_orders',       'sales_order_id'),
      ('stock_adjustment_items',   'stock_adjustments',  'adjustment_id'),
      ('stock_transfer_items',     'stock_transfers',    'transfer_id')
    ) AS t(child_tbl, parent_tbl, fk_col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid', rec.child_tbl);

    -- For journal_lines, disable the posted-entry mutation guard during backfill only
    IF rec.child_tbl = 'journal_lines' THEN
      EXECUTE 'ALTER TABLE public.journal_lines DISABLE TRIGGER USER';
    END IF;

    EXECUTE format(
      'UPDATE public.%I c SET organization_id = p.organization_id
         FROM public.%I p
        WHERE c.%I = p.id AND c.organization_id IS NULL',
      rec.child_tbl, rec.parent_tbl, rec.fk_col
    );

    IF rec.child_tbl = 'journal_lines' THEN
      EXECUTE 'ALTER TABLE public.journal_lines ENABLE TRIGGER USER';
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', rec.child_tbl);

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public' AND table_name=rec.child_tbl
         AND constraint_name = rec.child_tbl || '_organization_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id)
           REFERENCES public.organizations(id) ON DELETE CASCADE',
        rec.child_tbl, rec.child_tbl || '_organization_id_fkey'
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id, %I)',
      'idx_' || rec.child_tbl || '_org_parent', rec.child_tbl, rec.fk_col
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_org_id ON public.%I', rec.child_tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_sync_org_id
         BEFORE INSERT OR UPDATE OF %I, organization_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public._sync_org_id_from_parent(%L, %L)',
      rec.fk_col, rec.child_tbl, rec.parent_tbl, rec.fk_col
    );
  END LOOP;
END
$do$;

DO $do$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'delivery_note_items','goods_receipt_items','journal_lines',
    'picking_list_items','purchase_order_items','quote_items',
    'sales_order_items','stock_adjustment_items','stock_transfer_items'
  ]
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (organization_id = public.get_user_organization_id(auth.uid())
                OR public.is_super_admin(auth.uid()))',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
                     OR public.is_super_admin(auth.uid()))',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (organization_id = public.get_user_organization_id(auth.uid())
                OR public.is_super_admin(auth.uid()))
         WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
                     OR public.is_super_admin(auth.uid()))',
      t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (organization_id = public.get_user_organization_id(auth.uid())
                OR public.is_super_admin(auth.uid()))',
      t || '_delete', t);
  END LOOP;
END
$do$;
