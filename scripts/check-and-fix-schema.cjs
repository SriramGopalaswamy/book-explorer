/**
 * Script to check where tables are and move them to grxbooks if needed
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function checkAndFix() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Check tables in public schema
    const publicTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_name
    `);

    // Check tables in grxbooks schema
    const grxbooksTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${SCHEMA_NAME}'
      ORDER BY table_name
    `);

    console.log(`📊 Tables in public schema: ${publicTables.rows.length}`);
    console.log(`📊 Tables in ${SCHEMA_NAME} schema: ${grxbooksTables.rows.length}\n`);

    if (publicTables.rows.length > 0) {
      console.log('⚠️  Found tables in public schema that should be in grxbooks!\n');
      console.log('Tables in public:');
      publicTables.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
      console.log('\nThese tables need to be moved to grxbooks schema.\n');
    }

    const grxbooksTableNames = new Set(grxbooksTables.rows.map(t => t.table_name));
    const publicTableNames = new Set(publicTables.rows.map(t => t.table_name));

    // Find tables that exist in public but not in grxbooks
    const toMove = publicTables.rows.filter(t => !grxbooksTableNames.has(t.table_name));

    if (toMove.length > 0) {
      console.log(`\n📦 Found ${toMove.length} tables to move from public to ${SCHEMA_NAME}:\n`);
      
      for (const { table_name } of toMove) {
        try {
          console.log(`   Moving ${table_name}...`);
          await client.query(`ALTER TABLE public.${table_name} SET SCHEMA ${SCHEMA_NAME}`);
          console.log(`   ✅ Moved ${table_name}\n`);
        } catch (error) {
          console.error(`   ❌ Error moving ${table_name}: ${error.message}\n`);
        }
      }
    } else if (publicTables.rows.length === 0) {
      console.log('✅ No tables in public schema - all good!\n');
    } else {
      console.log('⚠️  All tables in public already exist in grxbooks (or couldn\'t be moved)\n');
    }

    // Final count
    const finalGrxbooks = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = '${SCHEMA_NAME}'
    `);

    console.log(`\n✅ Final count: ${finalGrxbooks.rows[0].count} tables in ${SCHEMA_NAME} schema\n`);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

checkAndFix();
