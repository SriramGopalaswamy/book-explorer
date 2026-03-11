/**
 * Database Performance Monitor
 *
 * Tool to monitor database performance, identify slow queries,
 * check index usage, and provide optimization recommendations
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class DatabasePerformanceMonitor {
  constructor() {
    this.pool = pool;
  }

  /**
   * Get slow queries
   */
  async getSlowQueries() {
    console.log('\n📊 SLOW QUERIES (avg execution time > 100ms)');
    console.log('='.repeat(80));

    const query = `
      SELECT
        query,
        calls,
        ROUND(total_exec_time::numeric, 2) as total_time_ms,
        ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
        ROUND(max_exec_time::numeric, 2) as max_time_ms,
        ROUND(stddev_exec_time::numeric, 2) as stddev_ms,
        rows
      FROM pg_stat_statements
      WHERE query LIKE '%grxbooks%'
      AND mean_exec_time > 100
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `;

    try {
      const result = await this.pool.query(query);

      if (result.rows.length === 0) {
        console.log('✅ No slow queries found!');
        return;
      }

      result.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. Query (${row.calls} calls)`);
        console.log(`   Mean: ${row.mean_time_ms}ms | Max: ${row.max_time_ms}ms | StdDev: ${row.stddev_ms}ms`);
        console.log(`   Total Time: ${row.total_time_ms}ms | Rows: ${row.rows}`);
        console.log(`   SQL: ${row.query.substring(0, 100)}...`);
      });
    } catch (error) {
      if (error.message.includes('pg_stat_statements')) {
        console.log('⚠️  pg_stat_statements extension not enabled');
        console.log('   Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
      } else {
        console.error('Error:', error.message);
      }
    }
  }

  /**
   * Get table sizes
   */
  async getTableSizes() {
    console.log('\n📦 TABLE SIZES');
    console.log('='.repeat(80));

    const query = `
      SELECT
        tablename,
        pg_size_pretty(pg_total_relation_size('grxbooks.' || tablename)) as size,
        pg_total_relation_size('grxbooks.' || tablename) as size_bytes,
        (SELECT count(*) FROM grxbooks.profiles WHERE tablename = 'profiles') as row_count
      FROM pg_tables
      WHERE schemaname = 'grxbooks'
      ORDER BY pg_total_relation_size('grxbooks.' || tablename) DESC
      LIMIT 20
    `;

    try {
      const result = await this.pool.query(query);

      console.log('\nTable Name                     Size           Rows');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const name = row.tablename.padEnd(30);
        const size = (row.size || 'N/A').padEnd(15);
        console.log(`${name} ${size}`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexUsage() {
    console.log('\n🔍 INDEX USAGE STATISTICS');
    console.log('='.repeat(80));

    const query = `
      SELECT
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'grxbooks'
      ORDER BY idx_scan DESC
      LIMIT 20
    `;

    try {
      const result = await this.pool.query(query);

      console.log('\nTable                Index                          Scans    Size');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const table = row.tablename.padEnd(20);
        const index = row.indexname.padEnd(30);
        const scans = row.scans.toString().padStart(8);
        const size = (row.size || 'N/A').padEnd(10);
        console.log(`${table} ${index} ${scans} ${size}`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get unused indexes
   */
  async getUnusedIndexes() {
    console.log('\n🗑️  UNUSED INDEXES');
    console.log('='.repeat(80));

    const query = `
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        idx_scan as scans
      FROM pg_stat_user_indexes
      WHERE schemaname = 'grxbooks'
      AND idx_scan = 0
      AND indexrelid::regclass::text NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC
    `;

    try {
      const result = await this.pool.query(query);

      if (result.rows.length === 0) {
        console.log('✅ No unused indexes found!');
        return;
      }

      console.log('\nTable                Index                          Size       Scans');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const table = row.tablename.padEnd(20);
        const index = row.indexname.padEnd(30);
        const size = (row.size || 'N/A').padEnd(10);
        const scans = row.scans.toString().padStart(5);
        console.log(`${table} ${index} ${size} ${scans}`);
      });

      console.log('\n⚠️  Consider dropping unused indexes to save space and improve write performance');
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get missing indexes
   */
  async getMissingIndexes() {
    console.log('\n⚠️  POTENTIAL MISSING INDEXES');
    console.log('='.repeat(80));

    const query = `
      SELECT
        schemaname,
        tablename,
        attname as column_name,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'grxbooks'
      AND n_distinct > 100
      AND correlation < 0.1
      ORDER BY n_distinct DESC
      LIMIT 10
    `;

    try {
      const result = await this.pool.query(query);

      if (result.rows.length === 0) {
        console.log('✅ No obvious missing indexes detected!');
        return;
      }

      console.log('\nTable                Column                   Distinct Values');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const table = row.tablename.padEnd(20);
        const column = row.column_name.padEnd(25);
        const distinct = row.n_distinct.toString().padStart(15);
        console.log(`${table} ${column} ${distinct}`);
      });

      console.log('\n💡 Consider adding indexes on these columns if they are used in WHERE clauses');
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get cache hit ratio
   */
  async getCacheHitRatio() {
    console.log('\n💾 CACHE HIT RATIO');
    console.log('='.repeat(80));

    const query = `
      SELECT
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        CASE
          WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
          ELSE round(sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2)
        END as cache_hit_ratio
      FROM pg_statio_user_tables
      WHERE schemaname = 'grxbooks'
    `;

    try {
      const result = await this.pool.query(query);
      const ratio = result.rows[0].cache_hit_ratio;

      console.log(`\nCache Hit Ratio: ${ratio}%`);

      if (ratio > 95) {
        console.log('✅ Excellent! Your cache is working well.');
      } else if (ratio > 85) {
        console.log('⚠️  Good, but could be better. Consider increasing shared_buffers.');
      } else {
        console.log('❌ Poor cache performance. Increase shared_buffers in postgresql.conf.');
      }

      console.log(`\nHeap Blocks Read: ${result.rows[0].heap_read}`);
      console.log(`Heap Blocks Hit: ${result.rows[0].heap_hit}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get bloat information
   */
  async getTableBloat() {
    console.log('\n🗜️  TABLE BLOAT');
    console.log('='.repeat(80));

    const query = `
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_dead_tup as dead_tuples,
        n_live_tup as live_tuples,
        CASE
          WHEN n_live_tup > 0
          THEN round((n_dead_tup::float / n_live_tup::float) * 100, 2)
          ELSE 0
        END as dead_tuple_percent
      FROM pg_stat_user_tables
      WHERE schemaname = 'grxbooks'
      ORDER BY n_dead_tup DESC
      LIMIT 10
    `;

    try {
      const result = await this.pool.query(query);

      console.log('\nTable                Size       Dead Tuples  Live Tuples  Dead %');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const table = row.tablename.padEnd(20);
        const size = (row.size || 'N/A').padEnd(10);
        const dead = row.dead_tuples.toString().padStart(12);
        const live = row.live_tuples.toString().padStart(12);
        const percent = row.dead_tuple_percent.toString().padStart(7);
        console.log(`${table} ${size} ${dead} ${live} ${percent}%`);

        if (row.dead_tuple_percent > 20) {
          console.log(`   ⚠️  Consider running VACUUM on ${row.tablename}`);
        }
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get organization statistics
   */
  async getOrganizationStats() {
    console.log('\n🏢 ORGANIZATION STATISTICS');
    console.log('='.repeat(80));

    const query = `
      SELECT * FROM grxbooks.mv_organization_stats
      ORDER BY total_employees DESC
      LIMIT 10
    `;

    try {
      const result = await this.pool.query(query);

      console.log('\nOrganization          Employees  Active  Departments  New (30d)');
      console.log('-'.repeat(80));

      result.rows.forEach(row => {
        const name = row.organization_name.substring(0, 20).padEnd(20);
        const total = row.total_employees.toString().padStart(10);
        const active = row.active_employees.toString().padStart(7);
        const depts = row.total_departments.toString().padStart(12);
        const newHires = row.new_hires_30_days.toString().padStart(10);
        console.log(`${name} ${total} ${active} ${depts} ${newHires}`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats() {
    console.log('\n🔌 CONNECTION STATISTICS');
    console.log('='.repeat(80));

    const query = `
      SELECT
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
        max(now() - state_change) as longest_idle
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    try {
      const result = await this.pool.query(query);
      const stats = result.rows[0];

      console.log(`\nTotal Connections: ${stats.total_connections}`);
      console.log(`Active: ${stats.active}`);
      console.log(`Idle: ${stats.idle}`);
      console.log(`Idle in Transaction: ${stats.idle_in_transaction}`);

      if (stats.idle_in_transaction > 0) {
        console.log('\n⚠️  Warning: Idle in transaction connections found!');
        console.log('   These can cause lock contention and should be investigated.');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  /**
   * Run all checks
   */
  async runAll() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║          DATABASE PERFORMANCE MONITOR                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    await this.getCacheHitRatio();
    await this.getConnectionStats();
    await this.getTableSizes();
    await this.getSlowQueries();
    await this.getIndexUsage();
    await this.getUnusedIndexes();
    await this.getMissingIndexes();
    await this.getTableBloat();
    await this.getOrganizationStats();

    console.log('\n' + '='.repeat(80));
    console.log('✅ Performance monitoring complete!');
    console.log('='.repeat(80) + '\n');
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new DatabasePerformanceMonitor();

  const command = process.argv[2];

  switch (command) {
    case 'slow':
      monitor.getSlowQueries().finally(() => pool.end());
      break;
    case 'sizes':
      monitor.getTableSizes().finally(() => pool.end());
      break;
    case 'indexes':
      monitor.getIndexUsage().finally(() => pool.end());
      break;
    case 'unused':
      monitor.getUnusedIndexes().finally(() => pool.end());
      break;
    case 'cache':
      monitor.getCacheHitRatio().finally(() => pool.end());
      break;
    case 'bloat':
      monitor.getTableBloat().finally(() => pool.end());
      break;
    case 'connections':
      monitor.getConnectionStats().finally(() => pool.end());
      break;
    default:
      monitor.runAll().finally(() => pool.end());
  }
}

module.exports = DatabasePerformanceMonitor;
