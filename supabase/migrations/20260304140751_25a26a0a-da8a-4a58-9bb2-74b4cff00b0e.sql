
-- Dynamically recreate ALL organization_id FK constraints with ON DELETE CASCADE
-- This enables proper tenant deletion without FK violations

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      conname AS constraint_name,
      conrelid::regclass::text AS table_name,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'public.organizations'::regclass
      AND c.contype = 'f'
      AND c.confdeltype != 'c'  -- not already CASCADE
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      r.table_name, r.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.organizations(id) ON DELETE CASCADE',
      r.table_name, r.constraint_name, r.column_name
    );
  END LOOP;
END $$;
