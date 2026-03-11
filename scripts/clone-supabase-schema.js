import { Client } from 'pg';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

// Supabase connection details
const SUPABASE_PROJECT = 'qfgudhbrjfjmbamwsfuj';
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD;
const SUPABASE_DB_URL = `postgresql://postgres.${SUPABASE_PROJECT}:${SUPABASE_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

// Render PostgreSQL
const RENDER_DB_URL = process.env.DATABASE_URL;

async function cloneSchema() {
  if (!SUPABASE_PASSWORD) {
    console.error('❌ Error: SUPABASE_PASSWORD not set in .env file');
    console.log('\nTo get your Supabase password:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project: qfgudhbrjfjmbamwsfuj');
    console.log('3. Go to Settings > Database');
    console.log('4. Copy the password (or reset it)');
    console.log('5. Add to .env: SUPABASE_PASSWORD=your_password_here\n');
    process.exit(1);
  }

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

    // Phase 1: Create all tables
    console.log('📋 PHASE 1: Creating Tables\n');
    console.log('='.repeat(60));

    const tablesResult = await supabaseClient.query(`
      SELECT
        t.tablename,
        obj_description(c.oid) as table_comment
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.schemaname = 'public'
        AND t.tablename NOT LIKE 'pg_%'
        AND t.tablename NOT LIKE 'sql_%'
        AND n.nspname = 'public'
      ORDER BY t.tablename;
    `);

    console.log(`Found ${tablesResult.rows.length} tables to clone\n`);

    let createdTables = [];
    let skippedTables = [];
    let errorTables = [];

    for (const { tablename, table_comment } of tablesResult.rows) {
      console.log(`⏳ ${tablename}...`);

      try {
        // Get full table definition
        const columnsResult = await supabaseClient.query(`
          SELECT
            a.attname as column_name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
            a.attnotnull as not_null,
            (SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
             FROM pg_catalog.pg_attrdef d
             WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum) as column_default,
            col_description(a.attrelid, a.attnum) as column_comment
          FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1
            AND n.nspname = 'public'
            AND a.attnum > 0
            AND NOT a.attisdropped
          ORDER BY a.attnum;
        `, [tablename]);

        if (columnsResult.rows.length === 0) {
          console.log(`   ⚠️  No columns found\n`);
          skippedTables.push(tablename);
          continue;
        }

        // Build CREATE TABLE statement
        let createSQL = `CREATE TABLE IF NOT EXISTS grxbooks.${tablename} (\n`;

        const columnDefs = columnsResult.rows.map(col => {
          let def = `  ${col.column_name} ${col.data_type}`;

          if (col.not_null) {
            def += ' NOT NULL';
          }

          if (col.column_default) {
            // Skip auth-related defaults
            if (!col.column_default.includes('auth.') &&
                !col.column_default.includes('storage.')) {
              // Replace public schema references
              let defaultVal = col.column_default.replace(/public\./g, 'grxbooks.');
              def += ` DEFAULT ${defaultVal}`;
            }
          }

          return def;
        });

        createSQL += columnDefs.join(',\n');
        createSQL += '\n);';

        // Execute on Render
        await renderClient.query(createSQL);
        console.log(`   ✅ Created\n`);
        createdTables.push(tablename);

      } catch (error) {
        if (error.code === '42P07') {
          console.log(`   ⏭️  Already exists\n`);
          skippedTables.push(tablename);
        } else {
          console.log(`   ❌ Error: ${error.message.substring(0, 80)}\n`);
          errorTables.push({ table: tablename, error: error.message });
        }
      }
    }

    console.log('='.repeat(60));
    console.log('📊 Phase 1 Summary:');
    console.log(`   ✅ Created: ${createdTables.length}`);
    console.log(`   ⏭️  Skipped: ${skippedTables.length}`);
    console.log(`   ❌ Errors: ${errorTables.length}`);
    console.log('='.repeat(60) + '\n');

    // Phase 2: Add Primary Keys
    console.log('📋 PHASE 2: Adding Primary Keys\n');
    console.log('='.repeat(60));

    let pkCount = 0;
    for (const tablename of [...createdTables, ...skippedTables]) {
      const pkResult = await supabaseClient.query(`
        SELECT
          a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1
          AND n.nspname = 'public'
          AND i.indisprimary
        ORDER BY a.attnum;
      `, [tablename]);

      if (pkResult.rows.length > 0) {
        const pkColumns = pkResult.rows.map(r => r.column_name).join(', ');
        try {
          await renderClient.query(`
            ALTER TABLE grxbooks.${tablename}
            ADD PRIMARY KEY (${pkColumns});
          `);
          pkCount++;
          process.stdout.write(`\r   Added ${pkCount} primary keys...`);
        } catch (error) {
          // Ignore if PK already exists
          if (error.code !== '42P16') {
            console.log(`\n   ⚠️  ${tablename}: ${error.message.substring(0, 60)}`);
          }
        }
      }
    }
    console.log(`\n✅ Added ${pkCount} primary keys\n`);

    // Get final count
    const finalCount = await renderClient.query(`
      SELECT COUNT(*) as count
      FROM pg_tables
      WHERE schemaname = 'grxbooks';
    `);

    console.log('='.repeat(60));
    console.log(`✅ Total tables in grxbooks: ${finalCount.rows[0].count}`);
    console.log('='.repeat(60));

    // Save error log if any
    if (errorTables.length > 0) {
      const errorLog = path.join(__dirname, '..', 'migration-errors.log');
      fs.writeFileSync(errorLog, JSON.stringify(errorTables, null, 2));
      console.log(`\n⚠️  Errors logged to: migration-errors.log`);
    }

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    await supabaseClient.end();
    await renderClient.end();
  }
}

cloneSchema();
