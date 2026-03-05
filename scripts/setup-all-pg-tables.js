import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const DATABASE_URL = process.env.DATABASE_URL;

async function setupAllTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration files\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(filePath, 'utf8');

      console.log(`⏳ Processing: ${file}...`);

      // Replace public schema with grxbooks
      sql = sql.replace(/CREATE TABLE IF NOT EXISTS public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
      sql = sql.replace(/CREATE TABLE public\./g, 'CREATE TABLE grxbooks.');
      sql = sql.replace(/ALTER TABLE public\./g, 'ALTER TABLE grxbooks.');
      sql = sql.replace(/REFERENCES public\./g, 'REFERENCES grxbooks.');
      sql = sql.replace(/FROM public\./g, 'FROM grxbooks.');
      sql = sql.replace(/INSERT INTO public\./g, 'INSERT INTO grxbooks.');
      sql = sql.replace(/CREATE INDEX (.*?) ON public\./g, 'CREATE INDEX $1 ON grxbooks.');
      sql = sql.replace(/CREATE UNIQUE INDEX (.*?) ON public\./g, 'CREATE UNIQUE INDEX $1 ON grxbooks.');

      // Replace function schema paths
      sql = sql.replace(/SET search_path = public/g, 'SET search_path = grxbooks');
      sql = sql.replace(/SCHEMA public/g, 'SCHEMA grxbooks');

      try {
        await client.query(sql);
        console.log(`   ✅ Success\n`);
        successCount++;
      } catch (error) {
        console.log(`   ⚠️  Warning: ${error.message}\n`);
        errorCount++;
        errors.push({ file, error: error.message });
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Migration Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⚠️  Warnings: ${errorCount}`);
    console.log('='.repeat(60));

    if (errors.length > 0) {
      console.log('\n⚠️  Warnings (usually safe to ignore duplicates):');
      errors.forEach(({ file, error }) => {
        if (!error.includes('already exists')) {
          console.log(`   - ${file}: ${error.substring(0, 100)}...`);
        }
      });
    }

    // Count final tables
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log(`\n✅ Final table count: ${result.rows[0].count} tables in grxbooks schema`);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupAllTables();
