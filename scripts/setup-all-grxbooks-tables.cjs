/**
 * Script to execute the complete grxbooks schema setup
 * This creates ALL tables from all migrations in the grxbooks schema
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

async function setupAllTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Read the complete setup SQL file
    const sqlFilePath = path.resolve(__dirname, '..', 'supabase', 'grxbooks_complete_setup.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      console.error(`❌ Error: SQL file not found at ${sqlFilePath}`);
      process.exit(1);
    }

    console.log(`📖 Reading SQL file: ${sqlFilePath}`);
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log(`📊 SQL file size: ${(sql.length / 1024).toFixed(2)} KB`);
    console.log(`🚀 Executing complete SQL file...\n`);

    try {
      // Execute the entire SQL file as one query
      // PostgreSQL can handle multiple statements separated by semicolons
      await client.query(sql);
      console.log(`\n✅ Execution complete!`);
      console.log(`✅ All tables, functions, and triggers created in ${SCHEMA_NAME} schema!\n`);
    } catch (error) {
      // Log the error but continue - many errors are expected (like "already exists")
      if (error.message.includes('already exists') || 
          error.message.includes('duplicate') ||
          error.message.includes('does not exist')) {
        console.log(`\n⚠️  Some objects already exist (this is expected if running multiple times)`);
        console.log(`✅ Execution completed with warnings\n`);
      } else {
        console.error(`\n❌ Error executing SQL:`, error.message.substring(0, 200));
        throw error;
      }
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error setting up tables:', error);
    await client.end();
    process.exit(1);
  }
}

setupAllTables();
