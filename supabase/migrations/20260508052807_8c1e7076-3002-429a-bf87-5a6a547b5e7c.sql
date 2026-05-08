
-- ============================================================
-- T9: Aggregation views (security_invoker = on -> RLS preserved)
-- ============================================================
CREATE OR REPLACE VIEW public.v_sales_summary_by_org
WITH (security_invoker = on) AS
SELECT
  organization_id,
  status,
  COUNT(*) AS doc_count,
  COALESCE(SUM(total_amount), 0)::numeric AS total_value,
  MAX(created_at) AS last_activity_at
FROM public.invoices
GROUP BY organization_id, status;

CREATE OR REPLACE VIEW public.v_purchases_summary_by_org
WITH (security_invoker = on) AS
SELECT
  organization_id,
  status,
  COUNT(*) AS doc_count,
  COALESCE(SUM(total_amount), 0)::numeric AS total_value,
  MAX(created_at) AS last_activity_at
FROM public.bills
GROUP BY organization_id, status;

CREATE OR REPLACE VIEW public.v_orders_summary_by_org
WITH (security_invoker = on) AS
SELECT 'sales' AS kind, organization_id, status,
       COUNT(*) AS doc_count, COALESCE(SUM(total_amount),0)::numeric AS total_value
FROM public.sales_orders GROUP BY organization_id, status
UNION ALL
SELECT 'purchase' AS kind, organization_id, status,
       COUNT(*) AS doc_count, COALESCE(SUM(total_amount),0)::numeric AS total_value
FROM public.purchase_orders GROUP BY organization_id, status;

GRANT SELECT ON public.v_sales_summary_by_org,
                 public.v_purchases_summary_by_org,
                 public.v_orders_summary_by_org TO authenticated;

-- ============================================================
-- T10: Trigram indexes for fast ILIKE / search
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $do$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('customers',       'name'),
      ('customers',       'email'),
      ('vendors',         'name'),
      ('vendors',         'email'),
      ('items',           'name'),
      ('items',           'sku'),
      ('invoices',        'invoice_number'),
      ('bills',           'bill_number'),
      ('sales_orders',    'order_number'),
      ('purchase_orders', 'po_number')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=rec.tbl AND column_name=rec.col
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (%I gin_trgm_ops)',
        'idx_' || rec.tbl || '_' || rec.col || '_trgm', rec.tbl, rec.col
      );
    END IF;
  END LOOP;
END
$do$;

-- ============================================================
-- T10: Generic paginated search RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_documents(
  p_module text,
  p_q text DEFAULT '',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (id uuid, label text, sublabel text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid := public.get_user_organization_id(auth.uid());
  v_q text := '%' || coalesce(p_q,'') || '%';
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  p_limit := LEAST(GREATEST(p_limit, 1), 200);
  p_offset := GREATEST(p_offset, 0);

  IF p_module = 'customers' THEN
    RETURN QUERY
    SELECT c.id, c.name, c.email,
           COUNT(*) OVER ()::bigint
    FROM public.customers c
    WHERE c.organization_id = v_org
      AND (p_q = '' OR c.name ILIKE v_q OR coalesce(c.email,'') ILIKE v_q)
    ORDER BY c.name LIMIT p_limit OFFSET p_offset;
  ELSIF p_module = 'vendors' THEN
    RETURN QUERY
    SELECT v.id, v.name, v.email,
           COUNT(*) OVER ()::bigint
    FROM public.vendors v
    WHERE v.organization_id = v_org
      AND (p_q = '' OR v.name ILIKE v_q OR coalesce(v.email,'') ILIKE v_q)
    ORDER BY v.name LIMIT p_limit OFFSET p_offset;
  ELSIF p_module = 'items' THEN
    RETURN QUERY
    SELECT i.id, i.name, i.sku,
           COUNT(*) OVER ()::bigint
    FROM public.items i
    WHERE i.organization_id = v_org
      AND (p_q = '' OR i.name ILIKE v_q OR coalesce(i.sku,'') ILIKE v_q)
    ORDER BY i.name LIMIT p_limit OFFSET p_offset;
  ELSIF p_module = 'invoices' THEN
    RETURN QUERY
    SELECT inv.id, inv.invoice_number, inv.status,
           COUNT(*) OVER ()::bigint
    FROM public.invoices inv
    WHERE inv.organization_id = v_org
      AND (p_q = '' OR inv.invoice_number ILIKE v_q)
    ORDER BY inv.created_at DESC LIMIT p_limit OFFSET p_offset;
  ELSIF p_module = 'bills' THEN
    RETURN QUERY
    SELECT b.id, b.bill_number, b.status,
           COUNT(*) OVER ()::bigint
    FROM public.bills b
    WHERE b.organization_id = v_org
      AND (p_q = '' OR b.bill_number ILIKE v_q)
    ORDER BY b.created_at DESC LIMIT p_limit OFFSET p_offset;
  ELSE
    RAISE EXCEPTION 'Unknown module: %', p_module;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_documents(text, text, int, int) TO authenticated;

-- ============================================================
-- T11: Background job framework
-- ============================================================
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  module text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  progress integer NOT NULL DEFAULT 0,
  result jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_org_status_created
  ON public.background_jobs (organization_id, status, created_at DESC);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS background_jobs_select ON public.background_jobs;
CREATE POLICY background_jobs_select ON public.background_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS background_jobs_insert ON public.background_jobs;
CREATE POLICY background_jobs_insert ON public.background_jobs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              AND created_by = auth.uid());

DROP POLICY IF EXISTS background_jobs_update ON public.background_jobs;
CREATE POLICY background_jobs_update ON public.background_jobs
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid())
              OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_job(p_module text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_org uuid := public.get_user_organization_id(auth.uid());
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization context'; END IF;
  INSERT INTO public.background_jobs(organization_id, created_by, module, payload)
  VALUES (v_org, auth.uid(), p_module, p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, jsonb) TO authenticated;

-- ============================================================
-- T7: Status-transition audit log (table + trigger fn; not yet attached)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_status_transitions (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_status_transitions_record
  ON public.document_status_transitions (table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_status_transitions_org
  ON public.document_status_transitions (organization_id, changed_at DESC);

ALTER TABLE public.document_status_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dst_select ON public.document_status_transitions;
CREATE POLICY dst_select ON public.document_status_transitions
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.document_status_transitions
      (organization_id, table_name, record_id, old_status, new_status, changed_by)
    VALUES (NEW.organization_id, TG_TABLE_NAME, NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
