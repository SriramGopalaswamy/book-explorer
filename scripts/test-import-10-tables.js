import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function testImport10Tables() {
  const dumpFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  console.log('='.repeat(60));
  console.log('TEST: Importing 10 tables to grxbooks schema');
  console.log('='.repeat(60));
  console.log('');

  // Test with these 10 tables in dependency order
  const testTables = [
    'organizations',           // No dependencies
    'profiles',                // Depends on organizations
    'customers',               // Depends on organizations
    'vendors',                 // Depends on organizations
    'financial_years',         // Depends on organizations
    'gl_accounts',            // Depends on organizations
    'fiscal_periods',         // Depends on financial_years
    'invoices',               // Depends on organizations, customers
    'bills',                  // Depends on organizations, vendors
    'assets'                  // Depends on organizations, vendors, bills
  ];

  console.log('📖 Reading SQL dump file...');
  let sqlContent = fs.readFileSync(dumpFilePath, 'utf-8');
  console.log(`   ✅ Read ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  console.log('🔧 Fixing Supabase syntax...');

  // Fix ARRAY type syntax
  sqlContent = sqlContent.replace(/(\s+"[^"]+"\s+)ARRAY(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, '$1text[]$2');

  // Fix USER-DEFINED types
  sqlContent = sqlContent.replace(/\s+USER-DEFINED(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, ' text$1');

  console.log('   ✅ Fixed syntax');
  console.log('');

  // Extract only the selected tables
  console.log('✂️  Extracting 10 test tables...');

  const tableStatements = {};

  for (const table of testTables) {
    // Extract CREATE TABLE statement
    const createRegex = new RegExp(
      `-- Table: ${table}[\\s\\S]*?CREATE TABLE[^;]+;`,
      'i'
    );
    const createMatch = sqlContent.match(createRegex);

    if (createMatch) {
      tableStatements[table] = {
        create: createMatch[0].replace(/public\./g, 'grxbooks.'),
        inserts: []
      };
    }

    // Extract INSERT statements
    const insertRegex = new RegExp(
      `INSERT INTO public\\."${table}"[^;]+;`,
      'gi'
    );
    const insertMatches = sqlContent.match(insertRegex);

    if (insertMatches) {
      tableStatements[table].inserts = insertMatches.map(s =>
        s.replace(/public\./g, 'grxbooks.')
      );
    }

    console.log(`   ${table}: ${tableStatements[table]?.inserts?.length || 0} rows`);
  }

  console.log('');

  // Connect to database
  const pool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('🗑️  Dropping and recreating grxbooks schema...');
    await client.query('DROP SCHEMA IF EXISTS grxbooks CASCADE');
    await client.query('CREATE SCHEMA grxbooks');
    console.log('   ✅ Fresh schema ready');
    console.log('');

    console.log('📥 Importing tables in dependency order...');

    for (const table of testTables) {
      const statements = tableStatements[table];
      if (!statements) {
        console.log(`   ⚠️  ${table}: not found in dump`);
        continue;
      }

      try {
        // Create table
        await client.query(statements.create);
        console.log(`   ✅ ${table}: table created`);

        // Insert data
        if (statements.inserts.length > 0) {
          for (const insertStmt of statements.inserts) {
            try {
              await client.query(insertStmt);
            } catch (insertErr) {
              console.log(`   ⚠️  ${table}: insert error - ${insertErr.message.substring(0, 60)}`);
            }
          }
          console.log(`   ✅ ${table}: ${statements.inserts.length} rows inserted`);
        } else {
          console.log(`   ℹ️  ${table}: no data to insert`);
        }

      } catch (err) {
        console.log(`   ❌ ${table}: ${err.message.substring(0, 80)}`);
      }
    }

    console.log('');
    console.log('🔍 Verifying...');

    for (const table of testTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM grxbooks."${table}"`);
        console.log(`   ${table}: ${result.rows[0].count} rows`);
      } catch (err) {
        console.log(`   ${table}: (error)`);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ TEST COMPLETED!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testImport10Tables();
