/**
 * Debug why migrations are being skipped
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

async function debugMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Get a sample migration that was "skipped"
    const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
    const sampleFile = path.join(migrationsDir, '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql');
    
    console.log(`📄 Testing migration: ${path.basename(sampleFile)}\n`);
    
    const sql = fs.readFileSync(sampleFile, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Set search_path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, auth, public;`);
    
    // Try to execute and see the actual error
    try {
      await client.query(adaptedSQL);
      console.log('✅ Migration executed successfully\n');
    } catch (error) {
      console.log('❌ Migration error:');
      console.log(`   Message: ${error.message}`);
      console.log(`   Code: ${error.code}`);
      console.log(`   Detail: ${error.detail || 'N/A'}`);
      console.log();
      
      // Check what actually exists
      if (error.message.includes('already exists')) {
        const match = error.message.match(/relation\s+["']?([a-z_][a-z0-9_.]*)/i);
        if (match) {
          const relationName = match[1];
          console.log(`🔍 Checking where "${relationName}" exists:\n`);
          
          // Check in grxbooks
          const grxbooksCheck = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = '${SCHEMA_NAME}' AND table_name = $1
            ) as exists
          `, [relationName.replace(`${SCHEMA_NAME}.`, '')]);
          
          // Check in public
          const publicCheck = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            ) as exists
          `, [relationName.replace('public.', '')]);
          
          console.log(`   In ${SCHEMA_NAME}: ${grxbooksCheck.rows[0].exists ? 'YES' : 'NO'}`);
          console.log(`   In public: ${publicCheck.rows[0].exists ? 'YES' : 'NO'}`);
        }
      }
    }

    // Check what tables were actually created
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${SCHEMA_NAME}'
      ORDER BY table_name
    `);
    
    console.log(`\n📊 Current tables in ${SCHEMA_NAME}: ${tables.rows.length}`);
    tables.rows.forEach(t => console.log(`   - ${t.table_name}`));
    console.log();

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

debugMigration();
