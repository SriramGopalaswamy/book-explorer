const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

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
    })
    // Handle auth.users references - keep as is for test DB
    .replace(/REFERENCES\s+auth\.users/gi, 'REFERENCES auth.users');
  
  return adapted;
}

// Execute SQL using PostgreSQL client
async function executeSQL(client, sql, description = '') {
  try {
    if (description) {
      process.stdout.write(`   ${description}... `);
    }
    await client.query(sql);
    if (description) {
      console.log('✅');
    }
    return { success: true };
  } catch (error) {
    // Some errors are expected (like "already exists")
    if (error.message.includes('already exists') || 
        error.message.includes('duplicate') ||
        error.message.includes('does not exist')) {
      if (description) {
        console.log('⚠️  (already exists)');
      }
      return { success: true, warning: error.message };
    }
    if (description) {
      console.log(`❌ ${error.message.substring(0, 100)}`);
    }
    return { success: false, error: error.message };
  }
}

async function createSchema(client) {
  console.log(`\n📦 Creating schema: ${SCHEMA_NAME}...`);
  
  const sql = `
    CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};
    GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO ${process.env.DATABASE_USER || 'testdb_xiqm_user'};
  `;
  
  const result = await executeSQL(client, sql, 'Creating schema and granting permissions');
  if (result.success) {
    console.log(`✅ Schema ${SCHEMA_NAME} created successfully\n`);
    return true;
  } else {
    console.error(`❌ Failed to create schema: ${result.error}`);
    return false;
  }
}

async function applyMigration(client, migration) {
  process.stdout.write(`📄 ${migration.name}... `);
  
  try {
    const sql = fs.readFileSync(migration.path, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Execute the entire adapted SQL
    const result = await executeSQL(client, adaptedSQL);
    
    if (result.success) {
      console.log('✅');
      return true;
    } else {
      console.log(`❌ ${result.error?.substring(0, 80) || 'Error'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${error.message.substring(0, 80)}`);
    return false;
  }
}

async function verifyTables(client) {
  console.log(`\n🔍 Verifying tables in ${SCHEMA_NAME} schema...\n`);
  
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
      ORDER BY table_name;
    `, [SCHEMA_NAME]);
    
    if (result.rows.length > 0) {
      console.log(`✅ Found ${result.rows.length} tables:\n`);
      result.rows.forEach((row, index) => {
        if (index < 20) {
          console.log(`   ${(index + 1).toString().padStart(3)}. ${row.table_name}`);
        }
      });
      if (result.rows.length > 20) {
        console.log(`   ... and ${result.rows.length - 20} more tables`);
      }
      return result.rows.length;
    } else {
      console.log(`⚠️  No tables found in ${SCHEMA_NAME} schema`);
      return 0;
    }
  } catch (error) {
    console.error(`❌ Error verifying tables: ${error.message}`);
    return 0;
  }
}

async function main() {
  console.log('🚀 Setting up Test Database (Render PostgreSQL)\n');
  console.log(`Database: ${DATABASE_URL.split('@')[1]?.split('/')[0] || 'Connected'}`);
  console.log(`Schema: ${SCHEMA_NAME}\n`);
  
  let client;
  
  try {
    // Step 1: Connect to database
    console.log('🔌 Connecting to database...');
    client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('✅ Connected to database\n');

    // Step 2: Create schema
    const schemaCreated = await createSchema(client);
    if (!schemaCreated) {
      throw new Error('Failed to create schema');
    }

    // Step 3: Set search path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, public;`);

    // Step 4: Get all migrations
    const migrations = getMigrationFiles();
    console.log(`📚 Found ${migrations.length} migration files\n`);
    console.log('='.repeat(80));
    console.log('Applying migrations...\n');

    // Step 5: Apply migrations
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      process.stdout.write(`[${i + 1}/${migrations.length}] `);
      
      const success = await applyMigration(client, migration);
      if (success) {
        successCount++;
      } else {
        failCount++;
        errors.push(migration.name);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    if (failCount > 0) {
      console.log(`   ❌ Failed: ${failCount}`);
      if (errors.length <= 10) {
        console.log(`   Failed migrations: ${errors.join(', ')}`);
      }
    }

    // Step 6: Verify tables
    const tableCount = await verifyTables(client);

    console.log('\n✅ Database setup complete!\n');
    console.log(`📋 Summary:`);
    console.log(`   • Schema: ${SCHEMA_NAME}`);
    console.log(`   • Tables created: ${tableCount}`);
    console.log(`   • Migrations applied: ${successCount}/${migrations.length}\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused. Check:');
      console.error('   1. Database URL is correct');
      console.error('   2. Database is accessible from your network');
      console.error('   3. Firewall allows connections\n');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

main();
