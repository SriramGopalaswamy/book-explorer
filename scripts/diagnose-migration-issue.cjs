/**
 * Diagnose why migrations say "already exists"
 * This will show us EXACTLY what exists and what the error is
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
  adapted = adapted.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TYPE $1${schemaName}.`);
  adapted = adapted.replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TABLE $1${schemaName}.`);
  adapted = adapted.replace(/ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `ALTER TABLE $1${schemaName}.`);
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

async function diagnose() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // 1. Check what types exist in grxbooks
    const types = await client.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'grxbooks')
      AND typtype = 'e'
      ORDER BY typname
    `);
    console.log(`📋 Types in grxbooks schema: ${types.rows.length}`);
    types.rows.forEach(t => console.log(`   - ${t.typname}`));
    console.log();

    // 2. Check what functions exist in grxbooks
    const functions = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'grxbooks'
      ORDER BY routine_name
    `);
    console.log(`📋 Functions in grxbooks schema: ${functions.rows.length}`);
    if (functions.rows.length > 0) {
      functions.rows.forEach(f => console.log(`   - ${f.routine_name}`));
    }
    console.log();

    // 3. Check what tables exist in grxbooks
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grxbooks'
      ORDER BY table_name
    `);
    console.log(`📋 Tables in grxbooks schema: ${tables.rows.length}`);
    tables.rows.forEach(t => console.log(`   - ${t.table_name}`));
    console.log();

    // 4. Test a specific migration that was "skipped"
    const testMigration = '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql';
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', testMigration);
    
    console.log(`🔍 Testing migration: ${testMigration}\n`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Show what the adapted SQL tries to create
    console.log('📝 Objects this migration tries to create:');
    const createMatches = adaptedSQL.match(/CREATE\s+(TYPE|TABLE|FUNCTION|INDEX|POLICY)\s+[^\s]+/gi);
    if (createMatches) {
      createMatches.forEach(match => {
        const objType = match.match(/(TYPE|TABLE|FUNCTION|INDEX|POLICY)/i)?.[1] || 'UNKNOWN';
        const objName = match.match(/(?:TYPE|TABLE|FUNCTION|INDEX|POLICY)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:OR\s+REPLACE\s+)?([a-z_][a-z0-9_.]*)/i)?.[1] || 'UNKNOWN';
        console.log(`   ${objType}: ${objName}`);
      });
    }
    console.log();

    // Set search_path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, auth, public;`);

    // Try to execute and capture the EXACT error
    console.log('🚀 Attempting to execute migration...\n');
    try {
      await client.query(adaptedSQL);
      console.log('✅ Migration executed successfully (no errors)\n');
    } catch (error) {
      console.log('❌ Migration FAILED with error:');
      console.log(`   Error Code: ${error.code}`);
      console.log(`   Error Message: ${error.message}`);
      console.log(`   Error Detail: ${error.detail || 'N/A'}`);
      console.log(`   Error Hint: ${error.hint || 'N/A'}`);
      console.log(`   Error Position: ${error.position || 'N/A'}`);
      console.log();

      // Parse the error to see what object already exists
      if (error.message.includes('already exists')) {
        console.log('🔍 Analyzing "already exists" error:\n');
        
        // Try to extract the object name and type
        const typeMatch = error.message.match(/type\s+["']?([a-z_][a-z0-9_.]*)/i);
        const tableMatch = error.message.match(/relation\s+["']?([a-z_][a-z0-9_.]*)/i);
        const functionMatch = error.message.match(/function\s+["']?([a-z_][a-z0-9_.]*)/i);
        
        if (typeMatch) {
          const typeName = typeMatch[1];
          console.log(`   Object Type: TYPE`);
          console.log(`   Object Name: ${typeName}`);
          
          // Check if it exists in grxbooks
          const exists = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM pg_type t
              JOIN pg_namespace n ON t.typnamespace = n.oid
              WHERE n.nspname = 'grxbooks' AND t.typname = $1
            ) as exists
          `, [typeName.replace(`${SCHEMA_NAME}.`, '')]);
          console.log(`   Exists in grxbooks: ${exists.rows[0].exists ? 'YES' : 'NO'}`);
        }
        
        if (tableMatch) {
          const tableName = tableMatch[1];
          console.log(`   Object Type: TABLE/RELATION`);
          console.log(`   Object Name: ${tableName}`);
          
          // Check if it exists in grxbooks
          const exists = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'grxbooks' AND table_name = $1
            ) as exists
          `, [tableName.replace(`${SCHEMA_NAME}.`, '')]);
          console.log(`   Exists in grxbooks: ${exists.rows[0].exists ? 'YES' : 'NO'}`);
        }
        
        if (functionMatch) {
          const funcName = functionMatch[1];
          console.log(`   Object Type: FUNCTION`);
          console.log(`   Object Name: ${funcName}`);
        }
      }
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await client.end();
    process.exit(1);
  }
}

diagnose();
