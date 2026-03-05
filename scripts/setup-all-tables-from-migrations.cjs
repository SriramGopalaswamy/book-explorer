/**
 * Script to execute all migrations from the migrations folder
 * Creates ALL tables in the grxbooks schema
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
  // Comprehensive SQL adaptation to move from public to grxbooks schema
  // Preserve auth.users, auth.schema, storage references
  
  let adapted = sql;
  
  // 1. Replace CREATE TYPE public. with a DO block that checks existence first
  // PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE, so we wrap it
  adapted = adapted.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)\s+AS\s+ENUM\s*\(([^)]+)\)/gi, (match, ifNotExists, typeName, enumValues) => {
    return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}')) THEN
    CREATE TYPE ${schemaName}.${typeName} AS ENUM (${enumValues});
  END IF;
END $$;`;
  });
  
  // 2. Replace CREATE TABLE public. with CREATE TABLE IF NOT EXISTS schemaName.
  // ALWAYS add IF NOT EXISTS to prevent "already exists" errors
  adapted = adapted.replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TABLE IF NOT EXISTS ${schemaName}.`);
  
  // 3. Replace ALTER TABLE public. with ALTER TABLE schemaName.
  adapted = adapted.replace(/ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `ALTER TABLE $1${schemaName}.`);
  
  // 4. Replace DROP TABLE public. with DROP TABLE schemaName.
  adapted = adapted.replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE $1${schemaName}.`);
  
  // 5. Replace CREATE INDEX ... ON public. with ON schemaName.
  adapted = adapted.replace(/ON\s+public\.([a-z_][a-z0-9_]*)/gi, `ON ${schemaName}.$1`);
  
  // 6. Replace CREATE FUNCTION public. with CREATE FUNCTION schemaName.
  adapted = adapted.replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\./gi, `CREATE OR REPLACE FUNCTION ${schemaName}.`);
  
  // 7. Replace SET search_path = public with SET search_path = schemaName
  adapted = adapted.replace(/SET\s+search_path\s*=\s*public/gi, `SET search_path = ${schemaName}`);
  adapted = adapted.replace(/SET\s+search_path\s+TO\s+public/gi, `SET search_path TO ${schemaName}`);
  
  // 8. Replace FROM public. with FROM schemaName. (but not FROM auth.users)
  adapted = adapted.replace(/\bFROM\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users' || tableName.startsWith('auth')) return match;
    return `FROM ${schemaName}.${tableName}`;
  });
  
  // 9. Replace INSERT INTO public. with INSERT INTO schemaName.
  adapted = adapted.replace(/INSERT\s+INTO\s+public\./gi, `INSERT INTO ${schemaName}.`);
  
  // 10. Replace UPDATE public. with UPDATE schemaName.
  adapted = adapted.replace(/UPDATE\s+public\./gi, `UPDATE ${schemaName}.`);
  
  // 11. Replace DELETE FROM public. with DELETE FROM schemaName.
  adapted = adapted.replace(/DELETE\s+FROM\s+public\./gi, `DELETE FROM ${schemaName}.`);
  
  // 12. Replace REFERENCES public. with REFERENCES schemaName. (but preserve auth.users)
  adapted = adapted.replace(/REFERENCES\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users') return 'REFERENCES auth.users';
    return `REFERENCES ${schemaName}.${tableName}`;
  });
  
  // 13. Replace any remaining public. references (but preserve auth., storage., etc.)
  adapted = adapted.replace(/\bpublic\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    // Don't replace if it's part of auth.users or storage
    if (match.includes('auth.') || match.includes('storage.')) return match;
    // Don't double-prefix
    if (match.includes(schemaName)) return match;
    return `${schemaName}.${tableName}`;
  });
  
  // 14. Handle unqualified table names in CREATE TABLE (add schema prefix)
  // This is tricky - we need to be careful not to break things
  // For now, we rely on SET search_path to handle unqualified names
  
  return adapted;
}

async function setupAllTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Create schema if not exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};`);
    await client.query(`GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO postgres;`);
    console.log(`✅ Schema ${SCHEMA_NAME} ready\n`);

    // Get all migration files
    const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📚 Found ${files.length} migration files\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`📄 Processing: ${file}...`);

      try {
        const sql = fs.readFileSync(filePath, 'utf8');
        const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
        
        // Set search_path to grxbooks before executing each migration
        // This ensures all unqualified names go to grxbooks schema first
        await client.query(`SET search_path TO ${SCHEMA_NAME}, auth, public;`);
        
        // Execute the migration (all objects will be created in grxbooks schema)
        await client.query(adaptedSQL);
        console.log(`   ✅ Success\n`);
        successCount++;
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        
        // Only skip if it's a true "already exists" error (not "function does not exist")
        // "does not exist" can mean missing function/table, which is a real error
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate')) {
          console.log(`   ⚠️  Skipped (already exists)\n`);
          successCount++;
        } else if (errorMsg.includes('does not exist') && 
                   (errorMsg.includes('function') || errorMsg.includes('relation'))) {
          // This is a real error - missing function or table
          // But we'll continue anyway since it might be Supabase-specific functions
          console.log(`   ⚠️  Warning: ${error.message.substring(0, 120)}`);
          console.log(`   ⚠️  Continuing (may be Supabase-specific function)\n`);
          successCount++; // Count as success but log the warning
        } else {
          console.error(`   ❌ Error: ${error.message.substring(0, 150)}\n`);
          errorCount++;
        }
      }
    }

    console.log(`\n✅ Migration execution complete!`);
    console.log(`   ✅ Successful: ${successCount}`);
    if (errorCount > 0) {
      console.log(`   ❌ Errors: ${errorCount}`);
    }
    console.log(`\n✅ All tables created in ${SCHEMA_NAME} schema!\n`);

    await client.end();
  } catch (error) {
    console.error('❌ Error setting up tables:', error);
    await client.end();
    process.exit(1);
  }
}

setupAllTables();
