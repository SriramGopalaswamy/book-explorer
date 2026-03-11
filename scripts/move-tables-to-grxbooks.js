import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function moveTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    try {
      console.log('🔄 Moving tables from public to grxbooks schema...\n');

      // Get all tables in public schema
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      console.log(`Found ${tablesResult.rows.length} tables to move\n`);

      let moved = 0;
      let errors = 0;

      for (const row of tablesResult.rows) {
        const tableName = row.table_name;
        try {
          // Move table to grxbooks schema
          await client.query(`ALTER TABLE public."${tableName}" SET SCHEMA grxbooks`);
          console.log(`✅ Moved: ${tableName}`);
          moved++;
        } catch (error) {
          console.error(`❌ Error moving ${tableName}: ${error.message}`);
          errors++;
        }
      }

      console.log(`\n✅ Moved ${moved} tables to grxbooks schema`);
      if (errors > 0) {
        console.log(`⚠️  ${errors} errors occurred`);
      }

      // Verify
      const publicCount = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      const grxbooksCount = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'grxbooks'
      `);

      console.log(`\n📊 Final counts:`);
      console.log(`   public schema: ${publicCount.rows[0].count} tables`);
      console.log(`   grxbooks schema: ${grxbooksCount.rows[0].count} tables`);

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

moveTables();
