const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const SCHEMA_NAME = 'grxbooks';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Extract database connection details from Supabase URL
function getDatabaseConfig() {
  // Check for Supabase-specific database URL first
  const supabaseDbUrl = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL;
  
  if (supabaseDbUrl && supabaseDbUrl.includes('supabase')) {
    return { connectionString: supabaseDbUrl };
  }
  
  // Only use DATABASE_URL if it's for Supabase
  if (DATABASE_URL && DATABASE_URL.includes('supabase')) {
    return { connectionString: DATABASE_URL };
  }

  // Extract from Supabase URL
  // Format: https://project-ref.supabase.co
  // Database connection: postgresql://postgres:[password]@db.project-ref.supabase.co:5432/postgres
  const urlMatch = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('Could not extract project ref from SupABASE_URL');
  }

  const projectRef = urlMatch[1];
  
  // We need the database password - it should be in env or user needs to provide
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD;
  
  if (!dbPassword) {
    console.error('\n❌ Database password required!');
    console.error('\n📋 To get your Supabase database connection string:');
    console.error('   1. Go to: https://supabase.com/dashboard');
    console.error('   2. Select your project');
    console.error('   3. Go to: Settings → Database');
    console.error('   4. Scroll to "Connection string"');
    console.error('   5. Copy the "URI" connection string (looks like: postgresql://postgres:[YOUR-PASSWORD]@db.[project-ref].supabase.co:5432/postgres)');
    console.error('   6. Add to .env as: SUPABASE_DATABASE_URL="[connection-string]"');
    console.error('\n   OR extract just the password and set: SUPABASE_DB_PASSWORD="your-password"\n');
    throw new Error('SUPABASE_DB_PASSWORD or SUPABASE_DATABASE_URL required');
  }

  return {
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false }
  };
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
    });
  
  return adapted;
}

// Execute SQL using PostgreSQL client
async function executeSQL(client, sql, description = '') {
  try {
    if (description) {
      console.log(`   ${description}`);
    }
    await client.query(sql);
    return { success: true };
  } catch (error) {
    // Some errors are expected (like "already exists")
    if (error.message.includes('already exists') || 
        error.message.includes('duplicate') ||
        error.message.includes('does not exist')) {
      return { success: true, warning: error.message };
    }
    return { success: false, error: error.message };
  }
}

async function createSchema(client) {
  console.log(`\n📦 Creating schema: ${SCHEMA_NAME}...`);
  
  const sql = `
    CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};
    GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO authenticated;
    GRANT USAGE ON SCHEMA ${SCHEMA_NAME} TO anon;
    GRANT ALL ON SCHEMA ${SCHEMA_NAME} TO service_role;
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
  console.log(`📄 Processing: ${migration.name}`);
  
  try {
    const sql = fs.readFileSync(migration.path, 'utf8');
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    // Split by semicolons but preserve function/trigger definitions
    // Simple approach: execute the entire adapted SQL
    const result = await executeSQL(client, adaptedSQL);
    
    if (result.success) {
      if (result.warning) {
        console.log(`   ⚠️  ${result.warning}`);
      }
      console.log(`   ✅ Completed: ${migration.name}\n`);
      return true;
    } else {
      console.log(`   ❌ Error: ${result.error}\n`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error processing ${migration.name}:`, error.message);
    return false;
  }
}

async function seedData(client) {
  console.log(`\n🌱 Seeding data into ${SCHEMA_NAME} schema...\n`);
  
  const seedFile = path.join(__dirname, '..', 'supabase', 'seed.sql');
  
  if (!fs.existsSync(seedFile)) {
    console.log(`⚠️  Seed file not found: ${seedFile}`);
    console.log(`   Skipping data seeding. You can run it manually later.\n`);
    return false;
  }
  
  try {
    const sql = fs.readFileSync(seedFile, 'utf8');
    // Adapt seed SQL for grxbooks schema
    const adaptedSQL = adaptSQLForSchema(sql, SCHEMA_NAME);
    
    console.log(`   Executing seed script...`);
    const result = await executeSQL(client, adaptedSQL, 'Running seed script');
    
    if (result.success) {
      console.log(`   ✅ Data seeding completed\n`);
      return true;
    } else {
      console.log(`   ❌ Seeding failed: ${result.error}\n`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error seeding data:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Setting up GRXBooks Database Schema\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Schema: ${SCHEMA_NAME}\n`);

  let client;
  
  try {
    // Step 1: Get database configuration
    console.log('🔌 Connecting to database...');
    const dbConfig = getDatabaseConfig();
    client = new Client(dbConfig);
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

    // Step 5: Apply migrations
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      console.log(`[${i + 1}/${migrations.length}]`);
      
      const success = await applyMigration(client, migration);
      if (success) {
        successCount++;
      } else {
        failCount++;
        // Continue with other migrations even if one fails
      }
    }

    console.log('='.repeat(80));
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    if (failCount > 0) {
      console.log(`   ❌ Failed: ${failCount}`);
    }

    // Step 6: Seed data
    if (successCount > 0) {
      await seedData(client);
    }

    console.log('✅ Database setup complete!\n');
    console.log(`📋 Next steps:`);
    console.log(`   1. Verify tables: Check Supabase Dashboard → Table Editor`);
    console.log(`   2. Verify data: Run queries to check seeded data`);
    console.log(`   3. Update app config: Point your app to use ${SCHEMA_NAME} schema\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('DATABASE_PASSWORD')) {
      console.error('\n💡 To get your database password:');
      console.error('   1. Go to Supabase Dashboard → Settings → Database');
      console.error('   2. Copy the connection string');
      console.error('   3. Extract the password or use the full connection string');
      console.error('   4. Set DATABASE_URL or SUPABASE_DB_PASSWORD in .env\n');
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed');
    }
  }
}

main();
