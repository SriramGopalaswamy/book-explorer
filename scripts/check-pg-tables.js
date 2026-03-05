import { Client } from 'pg';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

async function checkTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Get all tables in grxbooks schema
    const result = await client.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'grxbooks'
      ORDER BY tablename;
    `);

    console.log(`\n📊 Found ${result.rows.length} tables in grxbooks schema:\n`);

    result.rows.forEach(row => {
      console.log(`  ${row.tablename.padEnd(40)} ${row.size}`);
    });

    // Get table count
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log(`\n✅ Total tables: ${countResult.rows[0].count}`);
    console.log(`⚠️  Expected: 100 tables (from Supabase)`);
    console.log(`📋 Missing: ${100 - countResult.rows[0].count} tables`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();
