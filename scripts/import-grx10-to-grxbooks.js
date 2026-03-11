import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

async function importGrx10ToGrxbooks() {
  const dumpFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  console.log('='.repeat(60));
  console.log('IMPORTING GRX10 DATA TO GRXBOOKS SCHEMA');
  console.log('='.repeat(60));
  console.log('');

  // Read the dump file
  console.log('📖 Reading SQL dump file...');
  let sqlContent = fs.readFileSync(dumpFilePath, 'utf-8');
  console.log(`   ✅ Read ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  // Replace all public. references with grxbooks.
  console.log('🔄 Modifying SQL to target grxbooks schema...');
  const originalContent = sqlContent;

  // Fix Supabase-specific syntax issues FIRST
  console.log('   🔧 Fixing Supabase syntax...');

  // Fix ARRAY type syntax: "column" ARRAY → "column" text[]
  sqlContent = sqlContent.replace(/(\s+"[^"]+"\s+)ARRAY(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, '$1text[]$2');

  // Fix USER-DEFINED types
  sqlContent = sqlContent.replace(/\s+USER-DEFINED(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, ' text$1');

  // Replace CREATE TABLE statements
  sqlContent = sqlContent.replace(/CREATE TABLE IF NOT EXISTS public\./g, 'CREATE TABLE IF NOT EXISTS grxbooks.');
  sqlContent = sqlContent.replace(/CREATE TABLE public\./g, 'CREATE TABLE grxbooks.');

  // Replace INSERT statements
  sqlContent = sqlContent.replace(/INSERT INTO public\./g, 'INSERT INTO grxbooks.');

  // Replace ALTER TABLE statements
  sqlContent = sqlContent.replace(/ALTER TABLE ONLY public\./g, 'ALTER TABLE ONLY grxbooks.');
  sqlContent = sqlContent.replace(/ALTER TABLE public\./g, 'ALTER TABLE grxbooks.');

  // Replace CONSTRAINT references
  sqlContent = sqlContent.replace(/REFERENCES public\./g, 'REFERENCES grxbooks.');

  const replacementCount = (originalContent.match(/public\./g) || []).length - (sqlContent.match(/public\./g) || []).length;
  console.log(`   ✅ Fixed Supabase syntax`);
  console.log(`   ✅ Replaced ${replacementCount} references from public → grxbooks`);
  console.log('');

  // Save modified SQL for inspection
  const modifiedPath = 'C:\\Users\\damod\\Downloads\\book-explorer\\scripts\\grx10-modified-for-grxbooks.sql';
  fs.writeFileSync(modifiedPath, sqlContent);
  console.log(`   💾 Saved modified SQL to: ${modifiedPath}`);
  console.log('');

  // Connect to database
  const pool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('🗑️  Step 1: Dropping and recreating grxbooks schema...');

    // Drop the entire grxbooks schema and recreate it
    // This is the cleanest way without needing superuser privileges
    await client.query('DROP SCHEMA IF EXISTS grxbooks CASCADE');
    console.log('   ✅ Dropped grxbooks schema');

    await client.query('CREATE SCHEMA grxbooks');
    console.log('   ✅ Created fresh grxbooks schema');
    console.log('');

    console.log('📥 Step 2: Importing GRX10 data...');
    console.log('   This may take a few minutes...');
    console.log('');

    // Execute the modified SQL
    try {
      await client.query(sqlContent);
      console.log('   ✅ SQL executed successfully!');
    } catch (err) {
      console.log(`   ❌ Error executing SQL: ${err.message}`);
      console.log('');
      console.log('   Trying to execute in smaller chunks...');

      // Split by statement and execute one by one
      const statements = sqlContent
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        try {
          await client.query(statements[i]);
          successCount++;
          if ((i + 1) % 100 === 0) {
            process.stdout.write(`\r   Executed ${i + 1}/${statements.length} statements...`);
          }
        } catch (stmtErr) {
          errorCount++;
          if (errorCount <= 5) {
            console.log(`\r   ⚠️  Statement ${i + 1} failed: ${stmtErr.message.substring(0, 80)}`);
          }
        }
      }

      console.log(`\r   ✅ Executed ${successCount}/${statements.length} statements`);
      if (errorCount > 0) {
        console.log(`   ⚠️  ${errorCount} statements failed`);
      }
    }

    console.log('');
    console.log('🔍 Step 3: Verifying import...');

    // Count rows in some key tables
    const checkTables = ['organizations', 'assets', 'invoices', 'profiles', 'subscriptions'];
    for (const table of checkTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM grxbooks."${table}"`);
        console.log(`   ${table}: ${result.rows[0].count} rows`);
      } catch (err) {
        console.log(`   ${table}: (error or does not exist)`);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ IMPORT COMPLETED!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

importGrx10ToGrxbooks();
