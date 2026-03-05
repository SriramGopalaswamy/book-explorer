import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const DATABASE_URL = process.env.DATABASE_URL;

// Split SQL into statements carefully
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');

  for (const line of lines) {
    // Check for dollar-quoted strings ($$...$$)
    const dollarMatches = line.match(/\$(\w*)\$/g);
    if (dollarMatches) {
      for (const match of dollarMatches) {
        if (!inDollarQuote) {
          dollarTag = match;
          inDollarQuote = true;
        } else if (match === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
    }

    current += line + '\n';

    // If we hit a semicolon and we're not in a dollar quote, it's the end of a statement
    if (line.trim().endsWith(';') && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function setupTables() {
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

    console.log(`📊 SQL file size: ${(sql.length / 1024).toFixed(2)} KB`);

    // Replace schema references
    console.log('🔄 Adapting SQL for PostgreSQL...');
    sql = sql.replace(/CREATE TABLE IF NOT EXISTS public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
    sql = sql.replace(/CREATE TABLE public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
    sql = sql.replace(/ALTER TABLE public\./g, 'ALTER TABLE grxbooks.');
    sql = sql.replace(/REFERENCES public\./g, 'REFERENCES grxbooks.');
    sql = sql.replace(/FROM public\./g, 'FROM grxbooks.');
    sql = sql.replace(/INSERT INTO public\./g, 'INSERT INTO grxbooks.');
    sql = sql.replace(/CREATE INDEX IF NOT EXISTS (.*?) ON public\./g, 'CREATE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/CREATE INDEX (.*?) ON public\./g, 'CREATE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/CREATE UNIQUE INDEX (.*?) ON public\./g, 'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON grxbooks.');
    sql = sql.replace(/SET search_path = public/g, 'SET search_path = grxbooks');

    console.log('📝 Splitting SQL into statements...');
    const statements = splitSQL(sql);
    console.log(`   Found ${statements.length} statements\n`);

    console.log('⏳ Executing statements...\n');
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip certain statements
      if (stmt.includes('ENABLE ROW LEVEL SECURITY') ||
          stmt.includes('CREATE POLICY') ||
          stmt.includes('auth.uid()') ||
          stmt.includes('storage.') ||
          stmt.startsWith('COMMENT ON')) {
        skipCount++;
        continue;
      }

      try {
        await client.query(stmt);
        successCount++;
        if (successCount % 10 === 0) {
          process.stdout.write(`\r   Progress: ${successCount}/${statements.length - skipCount} executed`);
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.code === '42P07' || // relation already exists
            error.code === '42710' || // object already exists
            error.code === '42P16' || // invalid table definition
            error.message.includes('already exists')) {
          skipCount++;
        } else {
          errorCount++;
          if (errorCount <= 5) { // Only show first 5 errors
            console.log(`\n   ⚠️  Error in statement ${i + 1}: ${error.message.substring(0, 100)}`);
          }
        }
      }
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 Execution Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ⚠️  Errors: ${errorCount}`);
    console.log('='.repeat(60));

    // Count final tables
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log(`\n✅ Total tables in grxbooks schema: ${result.rows[0].count}`);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupTables();
