
-- Rewrite inspect_database_structure() to use pg_catalog directly instead of
-- information_schema views.  The old version ran 5 correlated subqueries per
-- table against slow information_schema views, exceeding the Edge Function
-- timeout (~10 s) for databases with 50+ tables.  The new version pre-aggregates
-- all column, index, and PK data in three CTEs (one catalog scan each) and then
-- joins them to the table list in a single pass — O(1) catalog scans instead of O(N).

CREATE OR REPLACE FUNCTION public.inspect_database_structure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tables   jsonb;
  _relations jsonb;
  _health   jsonb;
BEGIN

  -- ── Tables + columns + indexes + PKs ─────────────────────────────────────────
  -- Three CTEs each scan their catalog table once; the final SELECT joins them.
  WITH
  col_agg AS (
    SELECT
      a.attrelid,
      count(*)::int                             AS col_count,
      jsonb_agg(
        jsonb_build_object(
          'name',             a.attname,
          'data_type',        pg_catalog.format_type(a.atttypid, a.atttypmod),
          'is_nullable',      CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
          'column_default',   pg_catalog.pg_get_expr(d.adbin, d.adrelid),
          'ordinal_position', a.attnum
        )
        ORDER BY a.attnum
      )                                         AS col_json
    FROM   pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
           ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE  a.attnum > 0
      AND  NOT a.attisdropped
    GROUP BY a.attrelid
  ),

  idx_agg AS (
    SELECT
      ix.indrelid,
      count(*)::int                             AS idx_count,
      jsonb_agg(
        jsonb_build_object(
          'index_name', i.relname,
          'index_def',  pg_catalog.pg_get_indexdef(ix.indexrelid)
        )
      )                                         AS idx_json
    FROM   pg_catalog.pg_index ix
    JOIN   pg_catalog.pg_class  i ON i.oid = ix.indexrelid
    GROUP BY ix.indrelid
  ),

  pk_agg AS (
    SELECT
      ix.indrelid,
      jsonb_agg(
        a.attname
        ORDER BY array_position(ix.indkey::int[], a.attnum::int)
      )                                         AS pk_cols
    FROM   pg_catalog.pg_index     ix
    JOIN   pg_catalog.pg_attribute a
           ON a.attrelid = ix.indrelid
          AND a.attnum   = ANY(ix.indkey)
    WHERE  ix.indisprimary
    GROUP BY ix.indrelid
  )

  SELECT jsonb_agg(t ORDER BY t->>'table_name')
  INTO   _tables
  FROM (
    SELECT jsonb_build_object(
      'table_name',          c.relname,
      'schema_name',         n.nspname,
      'row_count',           GREATEST(c.reltuples::bigint, 0),
      'estimated_size',      pg_size_pretty(pg_total_relation_size(c.oid)),
      'estimated_size_bytes',pg_total_relation_size(c.oid),
      'column_count',        COALESCE(ca.col_count, 0),
      'index_count',         COALESCE(ia.idx_count, 0),
      'columns',             COALESCE(ca.col_json, '[]'::jsonb),
      'primary_keys',        pa.pk_cols,
      'indexes',             ia.idx_json
    ) AS t
    FROM   pg_catalog.pg_class     c
    JOIN   pg_catalog.pg_namespace n  ON n.oid = c.relnamespace
    LEFT JOIN col_agg ca ON ca.attrelid  = c.oid
    LEFT JOIN idx_agg ia ON ia.indrelid  = c.oid
    LEFT JOIN pk_agg  pa ON pa.indrelid  = c.oid
    WHERE  n.nspname = 'public'
      AND  c.relkind = 'r'
  ) sub;

  -- ── Foreign-key relations ────────────────────────────────────────────────────
  -- Uses pg_constraint directly instead of information_schema views.
  SELECT jsonb_agg(
    jsonb_build_object(
      'constraint_name', con.conname,
      'source_table',    src.relname,
      'source_column',   sa.attname,
      'target_table',    tgt.relname,
      'target_column',   ta.attname
    )
    ORDER BY src.relname, sa.attname
  )
  INTO _relations
  FROM   pg_catalog.pg_constraint con
  JOIN   pg_catalog.pg_class      src ON src.oid = con.conrelid
  JOIN   pg_catalog.pg_namespace  sn  ON sn.oid  = src.relnamespace
  JOIN   pg_catalog.pg_class      tgt ON tgt.oid = con.confrelid
  -- unnest key arrays so multi-column FKs produce one row each
  JOIN   pg_catalog.pg_attribute  sa
         ON sa.attrelid = con.conrelid  AND sa.attnum = ANY(con.conkey)
  JOIN   pg_catalog.pg_attribute  ta
         ON ta.attrelid = con.confrelid AND ta.attnum = ANY(con.confkey)
  WHERE  con.contype = 'f'
    AND  sn.nspname  = 'public';

  -- ── Health summary ───────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_tables', (
      SELECT count(*)
      FROM   pg_catalog.pg_class c
      JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public' AND c.relkind = 'r'
    ),
    'large_tables', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('table_name', c.relname, 'row_count', c.reltuples::bigint)),
        '[]'::jsonb
      )
      FROM   pg_catalog.pg_class c
      JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public' AND c.relkind = 'r' AND c.reltuples > 100000
    ),
    'tables_without_indexes', (
      SELECT COALESCE(jsonb_agg(c.relname), '[]'::jsonb)
      FROM   pg_catalog.pg_class c
      JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public' AND c.relkind = 'r'
        AND  NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_index ix WHERE ix.indrelid = c.oid
             )
    ),
    'total_size',       pg_size_pretty(COALESCE((
      SELECT sum(pg_total_relation_size(c.oid))
      FROM   pg_catalog.pg_class c
      JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public' AND c.relkind = 'r'
    ), 0)),
    'total_size_bytes', COALESCE((
      SELECT sum(pg_total_relation_size(c.oid))
      FROM   pg_catalog.pg_class c
      JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public' AND c.relkind = 'r'
    ), 0)
  )
  INTO _health;

  RETURN jsonb_build_object(
    'tables',       COALESCE(_tables,    '[]'::jsonb),
    'relations',    COALESCE(_relations, '[]'::jsonb),
    'health',       COALESCE(_health,    '{}'::jsonb),
    'inspected_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inspect_database_structure() TO authenticated;
