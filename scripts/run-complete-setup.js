import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const DATABASE_URL = process.env.DATABASE_URL;

async function runCompleteSetup() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read the complete setup SQL
    const sqlPath = path.join(__dirname, '..', 'supabase', 'grxbooks_complete_setup.sql');
    console.log(`📁 Reading: ${sqlPath}`);
    let sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`📊 SQL file size: ${(sql.length / 1024).toFixed(2)} KB\n`);

    // Replace schema references
    console.log('🔄 Adapting SQL for PostgreSQL (grxbooks schema)...');
    sql = sql.replace(/CREATE TABLE IF NOT EXISTS public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
    sql = sql.replace(/CREATE TABLE public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
    sql = sql.replace(/ALTER TABLE public\./g, 'ALTER TABLE IF EXISTS grxbooks.');
    sql = sql.replace(/REFERENCES public\./g, 'REFERENCES grxbooks.');
    sql = sql.replace(/FROM public\./g, 'FROM grxbooks.');
    sql = sql.replace(/INSERT INTO public\./g, 'INSERT INTO grxbooks.');
    sql = sql.replace(/CREATE INDEX IF NOT EXISTS (.*?) ON public\./g, 'CREATE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/CREATE INDEX (.*?) ON public\./g, 'CREATE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/CREATE UNIQUE INDEX IF NOT EXISTS (.*?) ON public\./g, 'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/CREATE UNIQUE INDEX (.*?) ON public\./g, 'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/SET search_path = public/g, 'SET search_path = grxbooks');
    sql = sql.replace(/SCHEMA public/g, 'SCHEMA grxbooks');

    // Remove Supabase-specific features
    sql = sql.replace(/ENABLE ROW LEVEL SECURITY;/g, '-- RLS disabled for PostgreSQL');
    sql = sql.replace(/ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/g, '-- RLS disabled');

    console.log('⏳ Executing SQL (this may take a minute)...\n');

    // Execute the SQL
    await client.query(sql);

    console.log('✅ SQL executed successfully!\n');

    // Count tables
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log(`✅ Total tables in grxbooks schema: ${result.rows[0].count}`);

    // Get table list
    const tables = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'grxbooks'
      ORDER BY tablename;
    `);

    console.log(`\n📋 Tables created:`);
    tables.rows.forEach((row, idx) => {
      console.log(`   ${(idx + 1).toString().padStart(3)}. ${row.tablename}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.position) {
      console.error(`   Position: ${error.position}`);
    }
    throw error;
  } finally {
    await client.end();
  }
}

runCompleteSetup();
