import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function cleanup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    try {
      console.log('🧹 Cleaning up public schema...\n');

      // List remaining tables
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      console.log(`Tables remaining in public schema (${tablesResult.rows.length}):`);
      tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));

      console.log('\n🗑️  Dropping all remaining tables from public schema...\n');

      // Drop all remaining tables
      await client.query(`
        DO $$ DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
            RAISE NOTICE 'Dropped: %', r.tablename;
          END LOOP;
        END $$;
      `);

      console.log('✅ Public schema is now empty\n');

      // Verify
      const finalCount = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      console.log(`📊 Final count: ${finalCount.rows[0].count} tables in public schema`);

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

cleanup();
