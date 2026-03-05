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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

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
  let adapted = sql
    .replace(/CREATE TABLE\s+public\./gi, `CREATE TABLE ${targetSchema}.`)
    .replace(/CREATE TABLE\s+IF NOT EXISTS\s+public\./gi, `CREATE TABLE IF NOT EXISTS ${targetSchema}.`)
    .replace(/ALTER TABLE\s+public\./gi, `ALTER TABLE ${targetSchema}.`)
    .replace(/SET search_path\s*=\s*public/gi, `SET search_path = ${targetSchema}`)
    .replace(/ON\s+public\./gi, `ON ${targetSchema}.`)
    .replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\./gi, `CREATE OR REPLACE FUNCTION ${targetSchema}.`)
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+.*\s+ON\s+public\./gi, (match) => {
      return match.replace(/ON\s+public\./gi, `ON ${targetSchema}.`);
    })
    .replace(/CREATE\s+TRIGGER\s+.*\s+ON\s+public\./gi, (match) => {
      return match.replace(/ON\s+public\./gi, `ON ${targetSchema}.`);
    })
    .replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE IF EXISTS ${targetSchema}.`)
    .replace(/FROM\s+public\./gi, `FROM ${targetSchema}.`)
    .replace(/INSERT\s+INTO\s+public\./gi, `INSERT INTO ${targetSchema}.`)
    .replace(/UPDATE\s+public\./gi, `UPDATE ${targetSchema}.`)
    .replace(/DELETE\s+FROM\s+public\./gi, `DELETE FROM ${targetSchema}.`)
    .replace(/SELECT\s+.*\s+FROM\s+public\./gi, (match) => {
      return match.replace(/FROM\s+public\./gi, `FROM ${targetSchema}.`);
    });
  
  return adapted;
}

// Execute SQL via Supabase REST API using RPC
async function executeSQL(sql) {
  try {
    // Try to execute via a custom RPC function if it exists
    // Otherwise, we'll need to use the SQL file approach
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    }).catch(() => null);

    if (response && response.ok) {
      return { success: true, data: await response.json() };
    }
    
    // If RPC doesn't exist, we'll generate SQL files for manual execution
    return { success: false, needsManual: true };
  } catch (error) {
    return { success: false, error: error.message, needsManual: true };
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
    console.log(`⚠️  Direct SQL execution not available via API`);
    return false;
  }
}

async function main() {
  console.log('🚀 Setting up GRXBooks Database Schema via Supabase API\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Schema: ${SCHEMA_NAME}\n`);

  try {
    // Step 1: Create schema
    const schemaCreated = await createSchema();
    
    // Step 2: Get all migrations
    const migrations = getMigrationFiles();
    console.log(`\n📚 Found ${migrations.length} migration files\n`);

    // Step 3: Generate combined SQL file
    console.log('📝 Generating combined migration SQL file for manual execution...\n');
    
    let combinedSQL = `-- GRXBooks Schema Setup\n`;
    combinedSQL += `-- Generated: ${new Date().toISOString()}\n`;
    combinedSQL += `-- Execute this in Supabase SQL Editor\n\n`;
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

    // Add seed data
    const seedFile = path.join(__dirname, '..', 'supabase', 'seed.sql');
    if (fs.existsSync(seedFile)) {
      console.log('📝 Adding seed data to SQL file...\n');
      const seedSQL = fs.readFileSync(seedFile, 'utf8');
      const adaptedSeedSQL = adaptSQLForSchema(seedSQL, SCHEMA_NAME);
      
      combinedSQL += `-- Seed Data\n`;
      combinedSQL += `-- ${'='.repeat(80)}\n`;
      combinedSQL += adaptedSeedSQL;
      combinedSQL += `\n\n`;
    }

    // Save combined SQL file
    const outputPath = path.join(__dirname, '..', 'supabase', `grxbooks_complete_setup.sql`);
    fs.writeFileSync(outputPath, combinedSQL, 'utf8');
    
    const fileStats = fs.statSync(outputPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`✅ Generated complete SQL file: ${outputPath}`);
    console.log(`   Size: ${fileSizeMB} MB`);
    console.log(`   Migrations: ${successCount}`);
    if (failCount > 0) {
      console.log(`   Failed: ${failCount}`);
    }
    
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. Open Supabase Dashboard → SQL Editor`);
    console.log(`   2. Open the file: ${outputPath}`);
    console.log(`   3. Copy and paste the entire contents`);
    console.log(`   4. Click "Run" to execute`);
    console.log(`\n   Note: This will create the schema, all tables, and seed data.\n`);

    // Try to execute via API if possible
    if (schemaCreated) {
      console.log('✅ Schema created via API');
      console.log('⚠️  Migrations need to be run manually via SQL Editor\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
