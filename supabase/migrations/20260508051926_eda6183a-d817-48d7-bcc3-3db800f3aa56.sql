
CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bills','credit_notes','delivery_notes','expenses',
    'goods_receipts','journal_entries','picking_lists','purchase_orders',
    'quotes','sales_orders','stock_adjustments','stock_transfers'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
      EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_version ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_bump_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()', t);
    END IF;
  END LOOP;
END
$do$;
