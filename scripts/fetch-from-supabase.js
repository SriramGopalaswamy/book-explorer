import { Client } from 'pg';
import { config } from 'dotenv';

config();

// Supabase connection details
const SUPABASE_PROJECT = 'qfgudhbrjfjmbamwsfuj';
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD; // We'll need this
const SUPABASE_DB_URL = `postgresql://postgres:${SUPABASE_PASSWORD}@db.${SUPABASE_PROJECT}.supabase.co:5432/postgres`;

// Render PostgreSQL
const RENDER_DB_URL = process.env.DATABASE_URL;

async function fetchAndCreateTables() {
  const supabaseClient = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  const renderClient = new Client({
    connectionString: RENDER_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to Supabase...');
    await supabaseClient.connect();
    console.log('✅ Connected to Supabase\n');

    console.log('🔌 Connecting to Render PostgreSQL...');
    await renderClient.connect();
    console.log('✅ Connected to Render PostgreSQL\n');

    // Get all tables from Supabase public schema
    console.log('📋 Fetching table list from Supabase...');
    const tablesResult = await supabaseClient.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE 'sql_%'
      ORDER BY tablename;
    `);

    console.log(`Found ${tablesResult.rows.length} tables\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const { tablename } of tablesResult.rows) {
      console.log(`⏳ Processing table: ${tablename}...`);

      try {
        // Get table schema from Supabase
        const schemaResult = await supabaseClient.query(`
          SELECT
            column_name,
            data_type,
            character_maximum_length,
            column_default,
            is_nullable,
            udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [tablename]);

        if (schemaResult.rows.length === 0) {
          console.log(`   ⚠️  No columns found, skipping\n`);
          skipCount++;
          continue;
        }

        // Build CREATE TABLE statement
        let createSQL = `CREATE TABLE IF NOT EXISTS grxbooks.${tablename} (\n`;

        const columns = schemaResult.rows.map(col => {
          let def = `  ${col.column_name} `;

          // Map data type
          if (col.data_type === 'ARRAY') {
            def += col.udt_name.replace('_', '') + '[]';
          } else if (col.data_type === 'USER-DEFINED') {
            def += col.udt_name;
          } else if (col.data_type === 'character varying') {
            def += col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'TEXT';
          } else {
            def += col.data_type.toUpperCase();
          }

          // Add constraints
          if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
          }

          if (col.column_default) {
            // Clean up default value
            let defaultVal = col.column_default;
            // Don't add defaults that reference auth schema
            if (!defaultVal.includes('auth.')) {
              def += ` DEFAULT ${defaultVal}`;
            }
          }

          return def;
        });

        createSQL += columns.join(',\n');
        createSQL += '\n);';

        // Execute on Render PostgreSQL
        await renderClient.query(createSQL);
        console.log(`   ✅ Created successfully\n`);
        successCount++;

      } catch (error) {
        if (error.code === '42P07') { // Table already exists
          console.log(`   ⚠️  Already exists\n`);
          skipCount++;
        } else {
          console.log(`   ❌ Error: ${error.message}\n`);
          errorCount++;
        }
      }
    }

    console.log('='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

    // Get final count
    const finalCount = await renderClient.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log(`\n✅ Total tables in grxbooks: ${finalCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    throw error;
  } finally {
    await supabaseClient.end();
    await renderClient.end();
  }
}

if (!process.env.SUPABASE_PASSWORD) {
  console.error('❌ Error: SUPABASE_PASSWORD not set in .env file');
  console.log('\nPlease add your Supabase database password to .env:');
  console.log('SUPABASE_PASSWORD=your_password_here\n');
  process.exit(1);
}

fetchAndCreateTables();
