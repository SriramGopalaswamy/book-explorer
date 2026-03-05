/**
 * Verify the fix actually works by testing a real migration
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

function adaptSQLForSchema(sql, schemaName) {
  let adapted = sql;
  // Replace CREATE TYPE with DO block that checks existence (PostgreSQL doesn't support IF NOT EXISTS for types)
  adapted = adapted.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)\s+AS\s+ENUM\s*\(([^)]+)\)/gi, (match, ifNotExists, typeName, enumValues) => {
    return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}')) THEN
    CREATE TYPE ${schemaName}.${typeName} AS ENUM (${enumValues});
  END IF;
END $$;`;
  });
  // ALWAYS add IF NOT EXISTS to CREATE TABLE to prevent "already exists" errors
  adapted = adapted.replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TABLE IF NOT EXISTS ${schemaName}.`);
  adapted = adapted.replace(/ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `ALTER TABLE ${schemaName}.`);
  adapted = adapted.replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE IF EXISTS ${schemaName}.`);
  adapted = adapted.replace(/ON\s+public\.([a-z_][a-z0-9_]*)/gi, `ON ${schemaName}.$1`);
  adapted = adapted.replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\./gi, `CREATE OR REPLACE FUNCTION ${schemaName}.`);
  adapted = adapted.replace(/SET\s+search_path\s*=\s*public/gi, `SET search_path = ${schemaName}`);
  adapted = adapted.replace(/SET\s+search_path\s+TO\s+public/gi, `SET search_path TO ${schemaName}`);
  adapted = adapted.replace(/\bFROM\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users' || tableName.startsWith('auth')) return match;
    return `FROM ${schemaName}.${tableName}`;
  });
  adapted = adapted.replace(/INSERT\s+INTO\s+public\./gi, `INSERT INTO ${schemaName}.`);
  adapted = adapted.replace(/UPDATE\s+public\./gi, `UPDATE ${schemaName}.`);
  adapted = adapted.replace(/DELETE\s+FROM\s+public\./gi, `DELETE FROM ${schemaName}.`);
  adapted = adapted.replace(/REFERENCES\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users') return 'REFERENCES auth.users';
    return `REFERENCES ${schemaName}.${tableName}`;
  });
  adapted = adapted.replace(/\bpublic\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (match.includes('auth.') || match.includes('storage.')) return match;
    if (match.includes(schemaName)) return match;
    return `${schemaName}.${tableName}`;
  });
  return adapted;
}

async function verifyFix() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Test with the problematic migration
    const testMigration = '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql';
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', testMigration);
    
    console.log(`🔍 Testing migration with FIX: ${testMigration}\n`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Set search_path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, auth, public;`);

    // Count tables before
    const beforeCount = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = '${SCHEMA_NAME}'
    `);
    console.log(`📊 Tables before: ${beforeCount.rows[0].count}`);

    // Try to execute
    console.log('\n🚀 Executing migration with IF NOT EXISTS fix...\n');
    try {
      await client.query(adaptedSQL);
      console.log('✅ Migration executed successfully!\n');
      
      // Count tables after
      const afterCount = await client.query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = '${SCHEMA_NAME}'
      `);
      console.log(`📊 Tables after: ${afterCount.rows[0].count}`);
      
      if (parseInt(afterCount.rows[0].count) > parseInt(beforeCount.rows[0].count)) {
        console.log('✅ NEW TABLES WERE CREATED! Fix works!\n');
      } else {
        console.log('⚠️  No new tables (might already exist, which is fine)\n');
      }
      
    } catch (error) {
      console.log('❌ Migration still failed:');
      console.log(`   ${error.message}\n`);
      console.log('❌ Fix did NOT work - need different approach\n');
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

verifyFix();
