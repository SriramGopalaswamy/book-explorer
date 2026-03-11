import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function checkDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    try {
      // Check all schemas
      console.log('📊 Schemas in database:');
      const schemasResult = await client.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schema_name
      `);
      schemasResult.rows.forEach(row => console.log('  -', row.schema_name));

      // Check tables per schema
      console.log('\n📋 Tables per schema:');
      const tablesResult = await client.query(`
        SELECT table_schema, COUNT(*) as table_count
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY table_schema
        ORDER BY table_schema
      `);
      tablesResult.rows.forEach(row => {
        console.log(`  ${row.table_schema}: ${row.table_count} tables`);
      });

      // Check grxbooks schema specifically
      console.log('\n🔍 Checking grxbooks schema:');
      const grxbooksResult = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'grxbooks'
      `);
      console.log(`  grxbooks has ${grxbooksResult.rows[0].count} tables`);

      // List all tables with their schemas
      console.log('\n📝 All tables:');
      const allTablesResult = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
        LIMIT 50
      `);
      allTablesResult.rows.forEach(row => {
        console.log(`  ${row.table_schema}.${row.table_name}`);
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
