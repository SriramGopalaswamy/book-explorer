
CREATE OR REPLACE FUNCTION public.inspect_database_structure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tables jsonb;
  _relations jsonb;
  _health jsonb;
BEGIN
  SELECT jsonb_agg(t ORDER BY t->>'table_name') INTO _tables
  FROM (
    SELECT jsonb_build_object(
      'table_name', c.relname,
      'schema_name', n.nspname,
      'row_count', GREATEST(c.reltuples::bigint, 0),
      'estimated_size', pg_size_pretty(pg_total_relation_size(c.oid)),
      'estimated_size_bytes', pg_total_relation_size(c.oid),
      'column_count', (SELECT count(*) FROM information_schema.columns ic WHERE ic.table_schema = 'public' AND ic.table_name = c.relname),
      'index_count', (SELECT count(*) FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.tablename = c.relname),
      'columns', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', col.column_name,
          'data_type', col.data_type,
          'is_nullable', col.is_nullable,
          'column_default', col.column_default,
          'ordinal_position', col.ordinal_position
        ) ORDER BY col.ordinal_position)
        FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = c.relname
      ),
      'primary_keys', (
        SELECT jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position)
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = c.relname AND tc.constraint_type = 'PRIMARY KEY'
      ),
      'indexes', (
        SELECT jsonb_agg(jsonb_build_object(
          'index_name', pi.indexname,
          'index_def', pi.indexdef
        ))
        FROM pg_indexes pi
        WHERE pi.schemaname = 'public' AND pi.tablename = c.relname
      )
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  ) sub;

  SELECT jsonb_agg(jsonb_build_object(
    'constraint_name', tc.constraint_name,
    'source_table', tc.table_name,
    'source_column', kcu.column_name,
    'target_table', ccu.table_name,
    'target_column', ccu.column_name
  ) ORDER BY tc.table_name, kcu.column_name) INTO _relations
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';

  SELECT jsonb_build_object(
    'total_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'large_tables', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('table_name', c.relname, 'row_count', c.reltuples::bigint)), '[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.reltuples > 100000
    ),
    'tables_without_indexes', (
      SELECT COALESCE(jsonb_agg(c.relname), '[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND NOT EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.tablename = c.relname)
    ),
    'total_size', pg_size_pretty(COALESCE((SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'), 0)),
    'total_size_bytes', COALESCE((SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'), 0)
  ) INTO _health;

  RETURN jsonb_build_object(
    'tables', COALESCE(_tables, '[]'::jsonb),
    'relations', COALESCE(_relations, '[]'::jsonb),
    'health', COALESCE(_health, '{}'::jsonb),
    'inspected_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inspect_database_structure() TO authenticated;
