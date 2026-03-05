/**
 * Script to list all tables in grxbooks schema
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function listTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Get all tables in grxbooks schema
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grxbooks' 
      ORDER BY table_name
    `);

    console.log('📊 Tables in grxbooks schema:');
    console.log('='.repeat(50));
    
    if (result.rows.length === 0) {
      console.log('  (No tables found)');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.table_name}`);
      });
    }

    console.log(`\n✅ Total: ${result.rows.length} tables\n`);

    // Also get enums
    const enumResult = await client.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'grxbooks')
      AND typtype = 'e'
      ORDER BY typname
    `);

    if (enumResult.rows.length > 0) {
      console.log('📋 Enums in grxbooks schema:');
      console.log('='.repeat(50));
      enumResult.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.typname}`);
      });
      console.log();
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

listTables();
