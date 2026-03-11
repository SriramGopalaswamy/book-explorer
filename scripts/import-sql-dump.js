import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function importSQLDump() {
  const sqlFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';

  console.log('🔍 Reading SQL dump file...');
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

  console.log('📊 SQL file size:', (sqlContent.length / 1024 / 1024).toFixed(2), 'MB');
  console.log('📝 Total lines:', sqlContent.split('\n').length);

  // Create database connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('\n🔌 Connecting to database...');
    const client = await pool.connect();

    try {
      console.log('✅ Connected successfully!');
      console.log('\n🚀 Starting import...\n');

      // Execute the SQL dump
      const startTime = Date.now();
      await client.query(sqlContent);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n✅ Import completed successfully!');
      console.log(`⏱️  Duration: ${duration} seconds`);

      // Get table count
      const result = await client.query(`
        SELECT COUNT(*) as table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      console.log(`📊 Total tables in database: ${result.rows[0].table_count}`);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ Error during import:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('🗃️  PostgreSQL Database Import Tool');
console.log('=====================================\n');

importSQLDump().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
