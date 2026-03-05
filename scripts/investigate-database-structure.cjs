/**
 * Comprehensive investigation of database structure
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function investigate() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // 1. List all schemas
    const schemas = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    console.log('📋 All schemas in database:');
    schemas.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.schema_name}`);
    });
    console.log();

    // 2. Count tables in each schema
    console.log('📊 Table counts by schema:');
    console.log('='.repeat(60));
    for (const { schema_name } of schemas.rows) {
      const count = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'pg_%'
          AND table_name NOT LIKE '_%'
      `, [schema_name]);
      const tableCount = parseInt(count.rows[0].count);
      if (tableCount > 0) {
        console.log(`   ${schema_name}: ${tableCount} tables`);
      }
    }
    console.log();

    // 3. List ALL tables in public schema (if any)
    const publicTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
      ORDER BY table_name
    `);

    if (publicTables.rows.length > 0) {
      console.log(`📋 Tables in public schema (${publicTables.rows.length}):`);
      publicTables.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
      console.log();
    }

    // 4. List ALL tables in grxbooks schema
    const grxbooksTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grxbooks'
      ORDER BY table_name
    `);

    console.log(`📋 Tables in grxbooks schema (${grxbooksTables.rows.length}):`);
    if (grxbooksTables.rows.length > 0) {
      grxbooksTables.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
    } else {
      console.log('   (No tables found)');
    }
    console.log();

    // 5. Check if there are tables in other schemas
    const allTables = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_schema, table_name
      LIMIT 100
    `);

    if (allTables.rows.length > 0) {
      console.log(`📋 Sample of all application tables (showing first 100):`);
      console.log('='.repeat(60));
      let currentSchema = '';
      allTables.rows.forEach(row => {
        if (row.table_schema !== currentSchema) {
          currentSchema = row.table_schema;
          console.log(`\n   Schema: ${currentSchema}`);
        }
        console.log(`      - ${row.table_name}`);
      });
      console.log();
    }

    // 6. Check current search_path
    const searchPath = await client.query(`SHOW search_path`);
    console.log(`🔍 Current search_path: ${searchPath.rows[0].search_path}`);
    console.log();

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await client.end();
    process.exit(1);
  }
}

investigate();
