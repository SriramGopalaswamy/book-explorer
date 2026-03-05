/**
 * Script to check tables in all schemas
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function checkSchemas() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Check grxbooks schema
    const grxbooks = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grxbooks' 
      ORDER BY table_name
    `);

    // Check public schema (excluding system tables)
    const public = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_name
    `);

    console.log(`📊 Tables in grxbooks schema: ${grxbooks.rows.length}`);
    if (grxbooks.rows.length > 0) {
      grxbooks.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
    }
    console.log();

    console.log(`📊 Tables in public schema: ${public.rows.length}`);
    if (public.rows.length > 0) {
      public.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
    }
    console.log();

    // Check if migrations created tables without schema prefix
    const allTables = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'grxbooks')
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_schema, table_name
    `);

    console.log(`\n📋 All application tables:`);
    console.log('='.repeat(60));
    allTables.rows.forEach(row => {
      console.log(`   ${row.table_schema}.${row.table_name}`);
    });
    console.log();

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

checkSchemas();
