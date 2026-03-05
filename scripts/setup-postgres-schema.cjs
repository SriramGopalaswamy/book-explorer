/**
 * Setup PostgreSQL Schema from grxbooks_complete_setup.sql
 * Run this to create all missing tables in your PostgreSQL database
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

async function setupSchema() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read the complete setup SQL file
    const sqlFilePath = path.join(__dirname, '..', 'supabase', 'grxbooks_complete_setup.sql');
    console.log(`📄 Reading schema file: ${sqlFilePath}`);

    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    console.log(`✅ Schema file loaded (${(sql.length / 1024).toFixed(2)} KB)\n`);

    // Execute the schema
    console.log('🚀 Applying schema to database...');
    console.log('⏳ This may take a minute...\n');

    await client.query(sql);

    console.log('✅ Schema applied successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'grxbooks'
      ORDER BY table_name;
    `);

    console.log(`\n📊 Found ${result.rows.length} tables in grxbooks schema:`);
    result.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.table_name}`);
    });

    console.log('\n✨ Setup complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupSchema();
