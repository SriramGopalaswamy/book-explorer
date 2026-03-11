-- ================================================
-- Database Schema Optimization
-- ================================================
-- Adds indexes, improves RLS policies, creates views,
-- and optimizes query performance

-- ================================================
-- 1. Add Missing Audit Columns
-- ================================================

-- Add audit columns to profiles table if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'grxbooks'
                 AND table_name = 'profiles'
                 AND column_name = 'created_by') THEN
    ALTER TABLE grxbooks.profiles ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'grxbooks'
                 AND table_name = 'profiles'
                 AND column_name = 'updated_by') THEN
    ALTER TABLE grxbooks.profiles ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'grxbooks'
                 AND table_name = 'profiles'
                 AND column_name = 'deleted_at') THEN
    ALTER TABLE grxbooks.profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'grxbooks'
                 AND table_name = 'profiles'
                 AND column_name = 'deleted_by') THEN
    ALTER TABLE grxbooks.profiles ADD COLUMN deleted_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- ================================================
-- 2. Performance Indexes
-- ================================================

-- Profiles (Employees) Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_org_status ON grxbooks.profiles(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON grxbooks.profiles(email)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_ms365_email ON grxbooks.profiles(ms365_email)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON grxbooks.profiles(employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department ON grxbooks.profiles(department)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON grxbooks.profiles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_gin ON grxbooks.profiles
  USING gin(to_tsvector('english', full_name));

-- Organizations Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain ON grxbooks.organizations(subdomain)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_status ON grxbooks.organizations(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_tier ON grxbooks.organizations(subscription_tier);

-- User Roles Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_org ON grxbooks.user_roles(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON grxbooks.user_roles(role);

CREATE INDEX IF NOT EXISTS idx_user_roles_org_role ON grxbooks.user_roles(organization_id, role);

-- Platform Roles Indexes
CREATE INDEX IF NOT EXISTS idx_platform_roles_user ON grxbooks.platform_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_platform_roles_role ON grxbooks.platform_roles(role);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_org_dept_status ON grxbooks.profiles(
  organization_id, department, status
) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_org_created ON grxbooks.profiles(
  organization_id, created_at DESC
) WHERE deleted_at IS NULL;

-- ================================================
-- 3. Audit Log Indexes
-- ================================================

-- Audit logs indexes (if tables exist)
DO $$
BEGIN
  -- Basic audit logs
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'grxbooks' AND table_name = 'audit_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON grxbooks.audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
      ON grxbooks.audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
      ON grxbooks.audit_logs(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_status
      ON grxbooks.audit_logs(status_code);
  END IF;

  -- Action audit logs
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'grxbooks' AND table_name = 'action_audit_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_action_audit_created_at
      ON grxbooks.action_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_action_audit_resource
      ON grxbooks.action_audit_logs(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_action_audit_action
      ON grxbooks.action_audit_logs(action);
  END IF;

  -- Auth audit logs
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'grxbooks' AND table_name = 'auth_audit_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at
      ON grxbooks.auth_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_user
      ON grxbooks.auth_audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_event
      ON grxbooks.auth_audit_logs(event);
  END IF;
END $$;

-- ================================================
-- 4. Improved RLS Policies
-- ================================================

-- Drop and recreate profiles policies with better performance
DROP POLICY IF EXISTS profiles_select_policy ON grxbooks.profiles;
DROP POLICY IF EXISTS profiles_insert_policy ON grxbooks.profiles;
DROP POLICY IF EXISTS profiles_update_policy ON grxbooks.profiles;
DROP POLICY IF EXISTS profiles_delete_policy ON grxbooks.profiles;

-- Enable RLS
ALTER TABLE grxbooks.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can see profiles in their organization
CREATE POLICY profiles_select_policy ON grxbooks.profiles
  FOR SELECT
  USING (
    deleted_at IS NULL AND (
      -- User's own organization
      organization_id IN (
        SELECT organization_id
        FROM grxbooks.user_roles
        WHERE user_id = auth.uid()
      )
      OR
      -- Platform admins can see all
      EXISTS (
        SELECT 1
        FROM grxbooks.platform_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
      )
    )
  );

-- INSERT policy: Admin or HR can add profiles
CREATE POLICY profiles_insert_policy ON grxbooks.profiles
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM grxbooks.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'hr')
    )
    OR
    EXISTS (
      SELECT 1
      FROM grxbooks.platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- UPDATE policy: Admin or HR can update profiles
CREATE POLICY profiles_update_policy ON grxbooks.profiles
  FOR UPDATE
  USING (
    deleted_at IS NULL AND (
      organization_id IN (
        SELECT organization_id
        FROM grxbooks.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'hr')
      )
      OR
      -- Users can update their own profile
      id = auth.uid()
      OR
      EXISTS (
        SELECT 1
        FROM grxbooks.platform_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
      )
    )
  );

-- DELETE policy: Only admins can soft delete
CREATE POLICY profiles_delete_policy ON grxbooks.profiles
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM grxbooks.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1
      FROM grxbooks.platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- ================================================
-- 5. Materialized Views for Performance
-- ================================================

-- Organization statistics view
CREATE MATERIALIZED VIEW IF NOT EXISTS grxbooks.mv_organization_stats AS
SELECT
  o.id as organization_id,
  o.name as organization_name,
  COUNT(DISTINCT p.id) as total_employees,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_employees,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'inactive') as inactive_employees,
  COUNT(DISTINCT p.department) as total_departments,
  COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '30 days') as new_hires_30_days,
  COUNT(DISTINCT ur.user_id) as total_users,
  MAX(p.created_at) as last_employee_added,
  NOW() as last_refreshed
FROM grxbooks.organizations o
LEFT JOIN grxbooks.profiles p ON o.id = p.organization_id AND p.deleted_at IS NULL
LEFT JOIN grxbooks.user_roles ur ON o.id = ur.organization_id
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_stats_org
  ON grxbooks.mv_organization_stats(organization_id);

-- Employee summary view with roles
CREATE OR REPLACE VIEW grxbooks.v_employee_summary AS
SELECT
  p.id,
  p.organization_id,
  p.employee_id,
  p.full_name,
  p.email,
  p.ms365_email,
  p.department,
  p.status,
  p.date_of_joining,
  p.date_of_birth,
  p.phone_number,
  p.created_at,
  p.updated_at,
  ur.role as organization_role,
  pr.role as platform_role,
  CASE
    WHEN pr.role = 'super_admin' THEN true
    ELSE false
  END as is_platform_admin,
  CASE
    WHEN ur.role IN ('admin', 'hr') THEN true
    ELSE false
  END as is_org_admin,
  grxbooks.get_entity_custom_fields(p.organization_id, 'employee', p.id) as custom_fields
FROM grxbooks.profiles p
LEFT JOIN grxbooks.user_roles ur
  ON p.id = ur.user_id
  AND p.organization_id = ur.organization_id
LEFT JOIN grxbooks.platform_roles pr
  ON p.id = pr.user_id
WHERE p.deleted_at IS NULL;

-- Department summary view
CREATE OR REPLACE VIEW grxbooks.v_department_summary AS
SELECT
  organization_id,
  department,
  COUNT(*) as employee_count,
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status = 'inactive') as inactive_count,
  AVG(EXTRACT(YEAR FROM AGE(NOW(), date_of_joining))) as avg_tenure_years
FROM grxbooks.profiles
WHERE deleted_at IS NULL
AND department IS NOT NULL
GROUP BY organization_id, department;

-- ================================================
-- 6. Utility Functions
-- ================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION grxbooks.refresh_stats_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY grxbooks.mv_organization_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's permissions
CREATE OR REPLACE FUNCTION grxbooks.get_user_permissions(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  is_platform_admin BOOLEAN,
  organization_role TEXT,
  can_manage_employees BOOLEAN,
  can_manage_settings BOOLEAN,
  can_view_reports BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM grxbooks.platform_roles
      WHERE user_id = p_user_id AND role = 'super_admin'
    ) as is_platform_admin,
    COALESCE(ur.role, 'none') as organization_role,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM grxbooks.platform_roles
        WHERE user_id = p_user_id AND role = 'super_admin'
      ) THEN true
      WHEN ur.role IN ('admin', 'hr') THEN true
      ELSE false
    END as can_manage_employees,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM grxbooks.platform_roles
        WHERE user_id = p_user_id AND role = 'super_admin'
      ) THEN true
      WHEN ur.role = 'admin' THEN true
      ELSE false
    END as can_manage_settings,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM grxbooks.platform_roles
        WHERE user_id = p_user_id AND role = 'super_admin'
      ) THEN true
      WHEN ur.role IN ('admin', 'hr', 'finance', 'manager') THEN true
      ELSE false
    END as can_view_reports
  FROM grxbooks.user_roles ur
  WHERE ur.user_id = p_user_id
  AND ur.organization_id = p_organization_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to search employees
CREATE OR REPLACE FUNCTION grxbooks.search_employees(
  p_organization_id UUID,
  p_search_term TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  department TEXT,
  status TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.department,
    p.status,
    ts_rank(
      to_tsvector('english', COALESCE(p.full_name, '') || ' ' ||
                             COALESCE(p.email, '') || ' ' ||
                             COALESCE(p.employee_id, '')),
      plainto_tsquery('english', p_search_term)
    ) as rank
  FROM grxbooks.profiles p
  WHERE p.organization_id = p_organization_id
  AND p.deleted_at IS NULL
  AND (
    to_tsvector('english', COALESCE(p.full_name, '') || ' ' ||
                           COALESCE(p.email, '') || ' ' ||
                           COALESCE(p.employee_id, ''))
    @@ plainto_tsquery('english', p_search_term)
  )
  ORDER BY rank DESC, p.full_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================
-- 7. Performance Monitoring Queries
-- ================================================

-- View for slow queries (requires pg_stat_statements extension)
CREATE OR REPLACE VIEW grxbooks.v_slow_queries AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%grxbooks%'
AND mean_exec_time > 100  -- Queries taking more than 100ms on average
ORDER BY mean_exec_time DESC
LIMIT 50;

-- View for table sizes
CREATE OR REPLACE VIEW grxbooks.v_table_sizes AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'grxbooks'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View for index usage
CREATE OR REPLACE VIEW grxbooks.v_index_usage AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'grxbooks'
ORDER BY idx_scan DESC;

-- View for unused indexes
CREATE OR REPLACE VIEW grxbooks.v_unused_indexes AS
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE schemaname = 'grxbooks'
AND idx_scan = 0
AND indexrelid::regclass::text NOT LIKE '%_pkey'  -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

-- ================================================
-- 8. Data Integrity Constraints
-- ================================================

-- Add check constraints
DO $$
BEGIN
  -- Email format validation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'grxbooks'
    AND constraint_name = 'profiles_email_format'
  ) THEN
    ALTER TABLE grxbooks.profiles
      ADD CONSTRAINT profiles_email_format
      CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;

  -- Status validation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'grxbooks'
    AND constraint_name = 'profiles_status_valid'
  ) THEN
    ALTER TABLE grxbooks.profiles
      ADD CONSTRAINT profiles_status_valid
      CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated'));
  END IF;

  -- Phone number format (basic validation)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'grxbooks'
    AND constraint_name = 'profiles_phone_format'
  ) THEN
    ALTER TABLE grxbooks.profiles
      ADD CONSTRAINT profiles_phone_format
      CHECK (phone_number IS NULL OR phone_number ~ '^\+?[0-9\s\-\(\)]+$');
  END IF;
END $$;

-- ================================================
-- 9. Automatic Statistics Update
-- ================================================

-- Function to update organization statistics
CREATE OR REPLACE FUNCTION grxbooks.update_organization_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh materialized view after significant changes
  PERFORM grxbooks.refresh_stats_views();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh stats (runs asynchronously to avoid blocking)
-- Note: In production, schedule this via cron instead
-- CREATE TRIGGER refresh_org_stats_trigger
--   AFTER INSERT OR UPDATE OR DELETE ON grxbooks.profiles
--   FOR EACH STATEMENT
--   EXECUTE FUNCTION grxbooks.update_organization_stats();

-- ================================================
-- 10. Query Optimization Tips
-- ================================================

-- Analyze tables for better query planning
ANALYZE grxbooks.profiles;
ANALYZE grxbooks.organizations;
ANALYZE grxbooks.user_roles;
ANALYZE grxbooks.platform_roles;
ANALYZE grxbooks.tenant_settings;
ANALYZE grxbooks.custom_fields;
ANALYZE grxbooks.custom_field_values;
ANALYZE grxbooks.tenant_features;

-- ================================================
-- 11. Vacuum and Maintenance
-- ================================================

-- Set autovacuum settings for large tables
ALTER TABLE grxbooks.profiles SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE grxbooks.audit_logs SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
) IF EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'grxbooks' AND table_name = 'audit_logs'
);

-- ================================================
-- Summary
-- ================================================

COMMENT ON SCHEMA grxbooks IS 'Optimized multi-tenant schema with indexes, RLS, and views';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database optimization complete!';
  RAISE NOTICE '- Added performance indexes';
  RAISE NOTICE '- Improved RLS policies';
  RAISE NOTICE '- Created materialized views';
  RAISE NOTICE '- Added utility functions';
  RAISE NOTICE '- Set up monitoring views';
  RAISE NOTICE '- Added data integrity constraints';
END $$;
