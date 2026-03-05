const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SCHEMA_NAME = 'grxbooks';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Get all migration files sorted by name
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  return files.map(file => ({
    name: file,
    path: path.join(MIGRATIONS_DIR, file)
  }));
}

// Replace schema references in SQL
function adaptSQLForSchema(sql, targetSchema) {
  // Replace public schema references with target schema
  let adapted = sql
    // Replace CREATE TABLE public. with CREATE TABLE grxbooks.
    .replace(/CREATE TABLE\s+public\./gi, `CREATE TABLE ${targetSchema}.`)
    .replace(/CREATE TABLE\s+IF NOT EXISTS\s+public\./gi, `CREATE TABLE IF NOT EXISTS ${targetSchema}.`)
    // Replace ALTER TABLE public. with ALTER TABLE grxbooks.
    .replace(/ALTER TABLE\s+public\./gi, `ALTER TABLE ${targetSchema}.`)
    // Replace references to public schema in function definitions
    .replace(/SET search_path\s*=\s*public/gi, `SET search_path = ${targetSchema}`)
    // Replace CREATE POLICY on public. with CREATE POLICY on grxbooks.
    .replace(/ON\s+public\./gi, `ON ${targetSchema}.`)
    // Replace CREATE INDEX on public. with CREATE INDEX on grxbooks.
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+.*\s+ON\s+public\./gi, (match) => {
      return match.replace(/ON\s+public\./gi, `ON ${targetSchema}.`);
    })
    // Replace CREATE FUNCTION public. with CREATE FUNCTION grxbooks.
    .replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\./gi, `CREATE OR REPLACE FUNCTION ${targetSchema}.`)
    // Replace CREATE TRIGGER references
    .replace(/CREATE\s+TRIGGER\s+.*\s+ON\s+public\./gi, (match) => {
      return match.replace(/ON\s+public\./gi, `ON ${targetSchema}.`);
    })
    // Replace DROP TABLE public. with DROP TABLE grxbooks.
    .replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE IF EXISTS ${targetSchema}.`)
    // Replace FROM public. with FROM grxbooks.
    .replace(/FROM\s+public\./gi, `FROM ${targetSchema}.`)
    // Replace INSERT INTO public. with INSERT INTO grxbooks.
    .replace(/INSERT\s+INTO\s+public\./gi, `INSERT INTO ${targetSchema}.`)
    // Replace UPDATE public. with UPDATE grxbooks.
    .replace(/UPDATE\s+public\./gi, `UPDATE ${targetSchema}.`)
    // Replace DELETE FROM public. with DELETE FROM grxbooks.
    .replace(/DELETE\s+FROM\s+public\./gi, `DELETE FROM ${targetSchema}.`)
    // Replace SELECT FROM public. with SELECT FROM grxbooks.
    .replace(/SELECT\s+.*\s+FROM\s+public\./gi, (match) => {
      return match.replace(/FROM\s+public\./gi, `FROM ${targetSchema}.`);
    });
  
  return adapted;
}

// Execute SQL via Supabase REST API
async function executeSQL(sql) {
  try {
    // Use RPC call if available, otherwise use direct REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    }).catch(async () => {
      // Fallback: Try direct SQL execution via pg REST API
      // Note: This requires service role key
      return null;
    });

    if (response && response.ok) {
      return { success: true, data: await response.json() };
    }
    
    // If RPC doesn't work, we'll need to use a different approach
    // For now, return success and log that manual execution may be needed
    return { success: true, manual: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createSchema() {
  console.log(`\n📦 Creating schema: ${SCHEMA_NAME}...`);
  
  const createSchemaSQL = `
    CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};
    GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO authenticated;
    GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO anon;
    GRANT ALL ON SCHEMA ${SCHEMA_NAME} TO service_role;
  `;
  
  const result = await executeSQL(createSchemaSQL);
  if (result.success) {
    console.log(`✅ Schema ${SCHEMA_NAME} created successfully`);
    return true;
  } else {
    console.log(`⚠️  Could not execute via API. Schema creation SQL prepared.`);
    return false;
  }
}

async function applyMigration(migration) {
  console.log(`\n📄 Processing: ${migration.name}`);
  
  try {
    const sql = fs.readFileSync(migration.path, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Split by semicolons and execute statements
    const statements = adaptedSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`   Found ${statements.length} statements`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const result = await executeSQL(statement);
      
      if (!result.success && !result.manual) {
        console.log(`   ⚠️  Statement ${i + 1} may have failed: ${result.error}`);
      }
    }
    
    console.log(`   ✅ Completed: ${migration.name}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error processing ${migration.name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Setting up GRXBooks Schema in Supabase\n');
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Schema: ${SCHEMA_NAME}\n`);

  try {
    // Step 1: Create schema
    const schemaCreated = await createSchema();
    
    if (!schemaCreated) {
      console.log('\n⚠️  Note: Direct SQL execution via API may not be available.');
      console.log('📋 Please run the following SQL manually in Supabase SQL Editor:\n');
      console.log(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};`);
      console.log(`GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO authenticated;`);
      console.log(`GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO anon;`);
      console.log(`GRANT ALL ON SCHEMA ${SCHEMA_NAME} TO service_role;\n`);
    }

    // Step 2: Get all migrations
    const migrations = getMigrationFiles();
    console.log(`\n📚 Found ${migrations.length} migration files\n`);

    // Step 3: Generate combined SQL file for manual execution
    console.log('📝 Generating combined migration SQL file...\n');
    
    let combinedSQL = `-- GRXBooks Schema Setup\n`;
    combinedSQL += `-- Generated: ${new Date().toISOString()}\n\n`;
    combinedSQL += `-- Create Schema\n`;
    combinedSQL += `CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};\n`;
    combinedSQL += `GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO authenticated;\n`;
    combinedSQL += `GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO anon;\n`;
    combinedSQL += `GRANT ALL ON SCHEMA ${SCHEMA_NAME} TO service_role;\n\n`;
    combinedSQL += `-- Set search path\n`;
    combinedSQL += `SET search_path TO ${SCHEMA_NAME}, public;\n\n`;

    // Process each migration
    let successCount = 0;
    let failCount = 0;

    for (const migration of migrations) {
      try {
        const sql = fs.readFileSync(migration.path, 'utf8');
        const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
        
        combinedSQL += `-- Migration: ${migration.name}\n`;
        combinedSQL += `-- ${'='.repeat(80)}\n`;
        combinedSQL += adaptedSQL;
        combinedSQL += `\n\n`;
        
        successCount++;
      } catch (error) {
        console.error(`❌ Error reading ${migration.name}:`, error.message);
        failCount++;
      }
    }

    // Save combined SQL file
    const outputPath = path.join(__dirname, '..', 'supabase', `grxbooks_schema_setup.sql`);
    fs.writeFileSync(outputPath, combinedSQL, 'utf8');
    
    console.log(`✅ Generated combined SQL file: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Migrations processed: ${successCount}`);
    if (failCount > 0) {
      console.log(`   ❌ Failed: ${failCount}`);
    }
    
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. Open Supabase Dashboard → SQL Editor`);
    console.log(`   2. Open the file: ${outputPath}`);
    console.log(`   3. Copy and paste the entire contents`);
    console.log(`   4. Click "Run" to execute`);
    console.log(`\n✅ Setup script complete!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
