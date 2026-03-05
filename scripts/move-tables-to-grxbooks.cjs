/**
 * Script to move all tables from public schema to grxbooks schema
 * This ensures all application tables are in the grxbooks schema
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function moveTablesToGrxbooks() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database\n');

    // Ensure grxbooks schema exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};`);
    console.log(`✅ Schema ${SCHEMA_NAME} exists\n`);

    // Get all tables in public schema (excluding system tables)
    const { rows: publicTables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE '_%'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_name
    `);

    console.log(`📊 Found ${publicTables.length} tables in public schema\n`);

    if (publicTables.length === 0) {
      console.log('✅ No tables to move\n');
      await client.end();
      return;
    }

    // Check which tables already exist in grxbooks
    const { rows: grxbooksTables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = '${SCHEMA_NAME}'
      ORDER BY table_name
    `);

    const existingInGrxbooks = new Set(grxbooksTables.map(t => t.table_name));
    console.log(`📊 Found ${grxbooksTables.length} tables already in ${SCHEMA_NAME} schema\n`);

    let movedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const { table_name } of publicTables) {
      // Skip if already in grxbooks
      if (existingInGrxbooks.has(table_name)) {
        console.log(`⏭️  Skipping ${table_name} (already in ${SCHEMA_NAME})`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`📦 Moving ${table_name} from public to ${SCHEMA_NAME}...`);
        
        // Use ALTER TABLE ... SET SCHEMA to move the table
        await client.query(`
          ALTER TABLE public.${table_name} SET SCHEMA ${SCHEMA_NAME}
        `);
        
        console.log(`   ✅ Moved ${table_name}\n`);
        movedCount++;
      } catch (error) {
        // If table has dependencies or other issues, try to create it in grxbooks instead
        if (error.message.includes('cannot be moved') || 
            error.message.includes('depends on') ||
            error.message.includes('does not exist')) {
          console.log(`   ⚠️  Cannot move ${table_name}: ${error.message.substring(0, 80)}...\n`);
          errorCount++;
        } else {
          console.error(`   ❌ Error moving ${table_name}: ${error.message}\n`);
          errorCount++;
        }
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   ✅ Moved: ${movedCount} tables`);
    console.log(`   ⏭️  Skipped: ${skippedCount} tables (already in ${SCHEMA_NAME})`);
    if (errorCount > 0) {
      console.log(`   ❌ Errors: ${errorCount} tables`);
    }
    console.log();

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

moveTablesToGrxbooks();
