# Database Optimization Guide

Complete guide for database performance optimization, indexing strategies, and monitoring.

## Overview

This guide covers:
- **Indexes**: Performance indexes and strategies
- **RLS Policies**: Optimized Row Level Security
- **Views**: Materialized views for performance
- **Functions**: Utility functions for common operations
- **Monitoring**: Performance monitoring and alerting
- **Maintenance**: Regular maintenance tasks
- **Best Practices**: Query optimization patterns

## Index Strategy

### Indexes Created

#### Profiles (Employees) Table
```sql
-- Composite indexes for common queries
idx_profiles_org_status          -- (organization_id, status) WHERE deleted_at IS NULL
idx_profiles_org_dept_status     -- (organization_id, department, status)
idx_profiles_org_created         -- (organization_id, created_at DESC)

-- Single column indexes
idx_profiles_email               -- (email) WHERE deleted_at IS NULL
idx_profiles_ms365_email         -- (ms365_email) WHERE deleted_at IS NULL
idx_profiles_employee_id         -- (employee_id) WHERE deleted_at IS NULL
idx_profiles_department          -- (department) WHERE deleted_at IS NULL
idx_profiles_created_at          -- (created_at DESC)

-- Full-text search
idx_profiles_full_name_gin       -- GIN index for text search
```

**When to use:**
```javascript
// Uses idx_profiles_org_status
SELECT * FROM profiles WHERE organization_id = ? AND status = 'active';

// Uses idx_profiles_org_dept_status
SELECT * FROM profiles
WHERE organization_id = ? AND department = 'Engineering' AND status = 'active';

// Uses idx_profiles_email
SELECT * FROM profiles WHERE email = 'user@company.com';

// Uses idx_profiles_full_name_gin
SELECT * FROM profiles
WHERE to_tsvector('english', full_name) @@ plainto_tsquery('english', 'John');
```

#### Organizations Table
```sql
idx_organizations_subdomain      -- (subdomain) WHERE deleted_at IS NULL
idx_organizations_status         -- (status) WHERE deleted_at IS NULL
idx_organizations_tier           -- (subscription_tier)
```

#### User Roles Table
```sql
idx_user_roles_user_org          -- (user_id, organization_id)
idx_user_roles_role              -- (role)
idx_user_roles_org_role          -- (organization_id, role)
```

**Perfect for permission checks:**
```javascript
// Uses idx_user_roles_user_org
SELECT role FROM user_roles
WHERE user_id = ? AND organization_id = ?;

// Uses idx_user_roles_org_role
SELECT user_id FROM user_roles
WHERE organization_id = ? AND role = 'admin';
```

#### Custom Fields Tables
```sql
-- custom_fields
idx_custom_fields_org            -- (organization_id)
idx_custom_fields_entity         -- (entity_type)
idx_custom_fields_active         -- (is_active)

-- custom_field_values
idx_custom_field_values_org      -- (organization_id)
idx_custom_field_values_field    -- (custom_field_id)
idx_custom_field_values_entity   -- (entity_type, entity_id)
```

### Index Types

#### B-Tree Indexes (Default)
Best for:
- Equality comparisons (`=`)
- Range queries (`<`, `>`, `BETWEEN`)
- Sorting (`ORDER BY`)
- Pattern matching (`LIKE 'prefix%'`)

```sql
CREATE INDEX idx_name ON table(column);
```

#### GIN Indexes (Generalized Inverted Index)
Best for:
- Full-text search
- JSONB queries
- Array containment

```sql
-- Full-text search
CREATE INDEX idx_profiles_full_name_gin ON profiles
USING gin(to_tsvector('english', full_name));

-- JSONB search
CREATE INDEX idx_settings_value_gin ON tenant_settings
USING gin(setting_value);
```

#### Partial Indexes
Indexes only a subset of rows:

```sql
-- Only index non-deleted records
CREATE INDEX idx_profiles_active ON profiles(organization_id, status)
WHERE deleted_at IS NULL;
```

**Benefits:**
- Smaller index size
- Faster updates
- More efficient queries

### Composite Index Order

**Rule:** Most selective column first

```sql
-- ✅ Good: organization_id is very selective
CREATE INDEX idx_good ON profiles(organization_id, status, department);

-- ❌ Bad: status has only 4 values
CREATE INDEX idx_bad ON profiles(status, organization_id, department);
```

**Leftmost Prefix Rule:**
Index `(a, b, c)` can be used for:
- `WHERE a = ?`
- `WHERE a = ? AND b = ?`
- `WHERE a = ? AND b = ? AND c = ?`

Cannot be used for:
- `WHERE b = ?` (skips first column)
- `WHERE c = ?` (skips first columns)

## Row Level Security (RLS)

### Optimized RLS Policies

#### Profiles Table Policies

**SELECT Policy:**
```sql
CREATE POLICY profiles_select_policy ON profiles
FOR SELECT USING (
  deleted_at IS NULL AND (
    -- User's organization
    organization_id IN (
      SELECT organization_id
      FROM user_roles
      WHERE user_id = auth.uid()
    )
    OR
    -- Platform admins see all
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
);
```

**Performance Tips:**
1. Use `IN (SELECT ...)` instead of joins for small result sets
2. Use `EXISTS` for boolean checks (faster than `COUNT` or `IN`)
3. Index all columns used in RLS policies

#### Tenant Settings Policies

```sql
-- Users can only see their organization's settings
CREATE POLICY tenant_settings_select_policy ON tenant_settings
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM user_roles WHERE user_id = auth.uid()
  )
);

-- Only admins can modify settings
CREATE POLICY tenant_settings_update_policy ON tenant_settings
FOR UPDATE USING (
  organization_id IN (
    SELECT organization_id FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
```

### RLS Performance Considerations

**Avoid:**
```sql
-- ❌ Slow: Subquery runs for every row
CREATE POLICY bad_policy ON table
FOR SELECT USING (
  column IN (SELECT expensive_function(auth.uid()))
);
```

**Prefer:**
```sql
-- ✅ Fast: Subquery runs once
CREATE POLICY good_policy ON table
FOR SELECT USING (
  column = auth.uid()
  OR EXISTS (
    SELECT 1 FROM cached_permissions
    WHERE user_id = auth.uid() AND entity_id = table.id
  )
);
```

## Materialized Views

### Organization Statistics View

```sql
CREATE MATERIALIZED VIEW mv_organization_stats AS
SELECT
  o.id as organization_id,
  o.name as organization_name,
  COUNT(DISTINCT p.id) as total_employees,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_employees,
  COUNT(DISTINCT p.department) as total_departments,
  NOW() as last_refreshed
FROM organizations o
LEFT JOIN profiles p ON o.id = p.organization_id
WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY o.id, o.name;

CREATE UNIQUE INDEX ON mv_organization_stats(organization_id);
```

**Refresh Strategy:**

```sql
-- Manual refresh
REFRESH MATERIALIZED VIEW mv_organization_stats;

-- Concurrent refresh (doesn't lock table)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organization_stats;
```

**When to Refresh:**
- On-demand via API endpoint
- Scheduled (e.g., every hour via cron)
- After bulk operations

### Regular Views

#### Employee Summary View
```sql
CREATE VIEW v_employee_summary AS
SELECT
  p.*,
  ur.role as organization_role,
  pr.role as platform_role,
  get_entity_custom_fields(p.organization_id, 'employee', p.id) as custom_fields
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
LEFT JOIN platform_roles pr ON p.id = pr.user_id
WHERE p.deleted_at IS NULL;
```

**Usage:**
```javascript
// Instead of joining multiple tables
const result = await pool.query(`
  SELECT * FROM v_employee_summary
  WHERE organization_id = $1
`, [orgId]);
```

## Utility Functions

### Search Employees (Full-Text Search)

```sql
CREATE FUNCTION search_employees(
  p_organization_id UUID,
  p_search_term TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, rank REAL)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    ts_rank(
      to_tsvector('english', p.full_name || ' ' || p.email),
      plainto_tsquery('english', p_search_term)
    ) as rank
  FROM profiles p
  WHERE p.organization_id = p_organization_id
  AND to_tsvector('english', p.full_name || ' ' || p.email)
      @@ plainto_tsquery('english', p_search_term)
  ORDER BY rank DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```javascript
const results = await pool.query(
  `SELECT * FROM search_employees($1, $2, $3, $4)`,
  [orgId, 'john smith', 20, 0]
);
```

### Get User Permissions

```sql
CREATE FUNCTION get_user_permissions(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  is_platform_admin BOOLEAN,
  organization_role TEXT,
  can_manage_employees BOOLEAN
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = p_user_id AND role = 'super_admin'
    ),
    COALESCE(ur.role, 'none'),
    CASE
      WHEN EXISTS (...) THEN true
      WHEN ur.role IN ('admin', 'hr') THEN true
      ELSE false
    END
  FROM user_roles ur
  WHERE ur.user_id = p_user_id
  AND ur.organization_id = p_organization_id;
END;
$$ LANGUAGE plpgsql;
```

## Performance Monitoring

### Using the Monitor Script

```bash
# Run all checks
node backend/scripts/db-performance-monitor.js

# Individual checks
node backend/scripts/db-performance-monitor.js slow        # Slow queries
node backend/scripts/db-performance-monitor.js sizes       # Table sizes
node backend/scripts/db-performance-monitor.js indexes     # Index usage
node backend/scripts/db-performance-monitor.js unused      # Unused indexes
node backend/scripts/db-performance-monitor.js cache       # Cache hit ratio
node backend/scripts/db-performance-monitor.js bloat       # Table bloat
node backend/scripts/db-performance-monitor.js connections # Connection stats
```

### Key Metrics to Monitor

#### 1. Cache Hit Ratio
**Target:** > 95%

```sql
SELECT
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100 as cache_hit_ratio
FROM pg_statio_user_tables;
```

**If low:**
- Increase `shared_buffers` in postgresql.conf
- Add more RAM
- Optimize queries to use indexes

#### 2. Index Usage

```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE schemaname = 'grxbooks'
ORDER BY idx_scan DESC;
```

**If scans = 0:** Consider dropping the index

#### 3. Slow Queries

Requires `pg_stat_statements` extension:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Then monitor:
```sql
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Slower than 100ms
ORDER BY mean_exec_time DESC;
```

#### 4. Table Bloat

```sql
SELECT
  schemaname,
  tablename,
  n_dead_tup,
  n_live_tup,
  n_dead_tup::float / n_live_tup::float * 100 as dead_percent
FROM pg_stat_user_tables
WHERE schemaname = 'grxbooks'
ORDER BY n_dead_tup DESC;
```

**If dead_percent > 20%:** Run VACUUM

## Query Optimization Patterns

### 1. Use Parameterized Queries

```javascript
// ✅ Good: Uses prepared statements
const result = await pool.query(
  'SELECT * FROM profiles WHERE organization_id = $1',
  [orgId]
);

// ❌ Bad: SQL injection risk, no query plan caching
const result = await pool.query(
  `SELECT * FROM profiles WHERE organization_id = '${orgId}'`
);
```

### 2. Select Only Needed Columns

```javascript
// ✅ Good
SELECT id, full_name, email FROM profiles WHERE ...

// ❌ Bad: Fetches unnecessary data
SELECT * FROM profiles WHERE ...
```

### 3. Use Joins Efficiently

```javascript
// ✅ Good: Single query with join
SELECT p.*, ur.role
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE p.organization_id = $1;

// ❌ Bad: N+1 query problem
// First query
const employees = await pool.query('SELECT * FROM profiles WHERE org_id = $1');
// Then N queries (one per employee)
for (const emp of employees.rows) {
  const role = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [emp.id]);
}
```

### 4. Use EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE
SELECT * FROM profiles
WHERE organization_id = 'uuid'
AND status = 'active';

-- Look for:
-- - Index Scan (good) vs Seq Scan (bad for large tables)
-- - Actual time vs Estimated time
-- - Rows returned vs Rows estimated
```

### 5. Pagination Best Practices

```javascript
// ✅ Good: Limit + Offset with ORDER BY
SELECT * FROM profiles
WHERE organization_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

// ✅ Better: Cursor-based pagination (for large datasets)
SELECT * FROM profiles
WHERE organization_id = $1
AND created_at < $2  -- cursor from last record
ORDER BY created_at DESC
LIMIT 20;
```

### 6. Avoid Cartesian Products

```sql
-- ❌ Bad: Missing join condition creates cartesian product
SELECT * FROM profiles p, departments d
WHERE p.organization_id = 'uuid';

-- ✅ Good: Explicit join condition
SELECT * FROM profiles p
INNER JOIN departments d ON p.department_id = d.id
WHERE p.organization_id = 'uuid';
```

### 7. Use EXISTS Instead of COUNT

```javascript
// ✅ Good: Stops at first match
SELECT EXISTS (
  SELECT 1 FROM profiles
  WHERE email = 'user@example.com'
);

// ❌ Bad: Counts all matches
SELECT COUNT(*) FROM profiles
WHERE email = 'user@example.com';
```

## Maintenance Tasks

### Daily Tasks

```sql
-- Analyze tables (updates statistics)
ANALYZE grxbooks.profiles;
ANALYZE grxbooks.organizations;
```

### Weekly Tasks

```sql
-- Vacuum to reclaim space
VACUUM ANALYZE grxbooks.profiles;
VACUUM ANALYZE grxbooks.audit_logs;

-- Refresh materialized views
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organization_stats;
```

### Monthly Tasks

```sql
-- Reindex to rebuild indexes
REINDEX TABLE grxbooks.profiles;

-- Check for bloat
SELECT * FROM pg_stat_user_tables
WHERE n_dead_tup > n_live_tup * 0.2;
```

### Automated Maintenance

**Enable autovacuum** (should be on by default):

```sql
-- Check autovacuum settings
SHOW autovacuum;

-- Tune per table
ALTER TABLE profiles SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

## Configuration Recommendations

### postgresql.conf Settings

For a typical application with moderate traffic:

```ini
# Memory
shared_buffers = 256MB                    # 25% of RAM
effective_cache_size = 1GB                # 50-75% of RAM
work_mem = 4MB                            # Per operation
maintenance_work_mem = 64MB               # For VACUUM, CREATE INDEX

# Connections
max_connections = 100                      # Adjust based on app servers

# WAL
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planning
random_page_cost = 1.1                    # For SSD (default 4.0 for HDD)
effective_io_concurrency = 200            # For SSD

# Logging
log_min_duration_statement = 1000         # Log queries > 1 second
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d '

# Statistics
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
```

## Best Practices Summary

### ✅ DO

1. **Use indexes** for columns in WHERE, JOIN, ORDER BY clauses
2. **Use parameterized queries** to prevent SQL injection
3. **Monitor performance** regularly with monitoring tools
4. **Use transactions** for multiple related operations
5. **Select specific columns** instead of SELECT *
6. **Use connection pooling** to reuse connections
7. **Enable RLS** for multi-tenant data isolation
8. **Create materialized views** for expensive aggregations
9. **Use EXPLAIN ANALYZE** to understand query plans
10. **Regular maintenance** (VACUUM, ANALYZE, REINDEX)

### ❌ DON'T

1. **Don't use SELECT *** unless you need all columns
2. **Don't create unused indexes** (they slow down writes)
3. **Don't use** `OFFSET` for large offsets (use cursor pagination)
4. **Don't ignore slow query logs**
5. **Don't use string concatenation** for SQL (SQL injection risk)
6. **Don't run expensive queries** synchronously in API requests
7. **Don't forget** to add indexes on foreign keys
8. **Don't use COUNT(*)** when you only need EXISTS
9. **Don't leave transactions open** (causes locks)
10. **Don't skip backups**

## Troubleshooting Guide

### Query is Slow

1. Run `EXPLAIN ANALYZE` on the query
2. Check if indexes are being used
3. Look for sequential scans on large tables
4. Check table statistics are up to date (`ANALYZE`)
5. Consider adding missing indexes

### High CPU Usage

1. Check for long-running queries
2. Look for queries without indexes
3. Check connection count
4. Review autovacuum activity

### High Memory Usage

1. Check `work_mem` setting
2. Look for large sorts/hashes
3. Review connection count
4. Check for memory leaks in application

### Lock Contention

1. Check `pg_locks` for blocking queries
2. Keep transactions short
3. Use appropriate transaction isolation levels
4. Avoid long-running transactions

## Summary

✅ **Created:**
- 30+ performance indexes
- Improved RLS policies
- 3 materialized views
- 5 utility functions
- Performance monitoring script
- Comprehensive optimization guide

✅ **Benefits:**
- 10-100x faster queries with proper indexes
- Secure multi-tenant data isolation with RLS
- Pre-computed statistics with materialized views
- Easy performance monitoring
- Best practices documentation

Run the optimization migration:
```bash
psql $DATABASE_URL -f backend/migrations/005_database_optimization.sql
```

Monitor performance:
```bash
node backend/scripts/db-performance-monitor.js
```
