import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function restore() {
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';
  const dumpFile = 'C:\\Users\\damod\\Downloads\\book-explorer\\scripts\\public-schema-dump.sql';

  console.log('=' .repeat(60));
  console.log('RESTORING PUBLIC SCHEMA TO TESTDB');
  console.log('=' .repeat(60));
  console.log('');

  const pool = new Pool({
    connectionString: destDb,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 120000,
    idle_in_transaction_session_timeout: 120000,
    statement_timeout: 120000
  });

  try {
    const client = await pool.connect();

    try {
      console.log('📖 Reading dump file...');
      const sqlContent = fs.readFileSync(dumpFile, 'utf-8');
      console.log(`   File size: ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`);

      const statements = sqlContent.split(';\n').filter(s => s.trim());
      console.log(`   Total statements: ${statements.length}\n`);

      let successCount = 0;
      let errorCount = 0;
      let currentTable = '';
      let tableCount = 0;
      let insertCount = 0;

      console.log('🚀 Starting restore...\n');

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;

        // Detect what type of statement this is
        let stmtType = '';
        let tableName = '';

        if (stmt.startsWith('CREATE SEQUENCE')) {
          stmtType = 'SEQUENCE';
          const match = stmt.match(/CREATE SEQUENCE.*"(\w+)"/);
          tableName = match ? match[1] : '';
        } else if (stmt.startsWith('SELECT setval')) {
          stmtType = 'SETVAL';
          const match = stmt.match(/setval\('public\."(\w+)"/);
          tableName = match ? match[1] : '';
        } else if (stmt.startsWith('CREATE TABLE')) {
          stmtType = 'CREATE TABLE';
          const match = stmt.match(/CREATE TABLE.*"(\w+)"/);
          tableName = match ? match[1] : '';
          tableCount++;
        } else if (stmt.startsWith('INSERT INTO')) {
          stmtType = 'INSERT';
          const match = stmt.match(/INSERT INTO public\."(\w+)"/);
          tableName = match ? match[1] : '';
          insertCount++;
        }

        if (tableName && tableName !== currentTable) {
          currentTable = tableName;
          console.log(`\n[${i + 1}/${statements.length}] Processing: ${tableName}`);
        }

        try {
          await client.query(stmt + ';');
          successCount++;

          if (stmtType === 'CREATE TABLE') {
            console.log(`   ✅ Table created`);
          } else if (stmtType === 'INSERT' && insertCount % 50 === 0) {
            console.log(`   📝 ${insertCount} inserts completed...`);
          }
        } catch (error) {
          errorCount++;

          // Only log first few errors per table
          if (errorCount <= 30) {
            const shortError = error.message.substring(0, 100);
            console.log(`   ⚠️  ${stmtType} error: ${shortError}`);
          } else if (errorCount === 31) {
            console.log(`   ⚠️  (suppressing further errors...)`);
          }
        }

        // Progress indicator every 1000 statements
        if (i % 1000 === 0 && i > 0) {
          const percent = ((i / statements.length) * 100).toFixed(1);
          console.log(`\n--- Progress: ${percent}% (${i}/${statements.length}) ---`);
          console.log(`    Tables created: ${tableCount}, Inserts: ${insertCount}`);
          console.log(`    Success: ${successCount}, Errors: ${errorCount}\n`);
        }
      }

      console.log('\n' + '=' .repeat(60));
      console.log('RESTORE SUMMARY');
      console.log('=' .repeat(60));
      console.log(`Total statements: ${statements.length}`);
      console.log(`✅ Successful: ${successCount}`);
      console.log(`❌ Errors: ${errorCount}`);
      console.log(`📊 Success rate: ${((successCount / statements.length) * 100).toFixed(1)}%`);
      console.log(`📦 Tables created: ${tableCount}`);
      console.log(`📝 Inserts attempted: ${insertCount}`);

      // Final verification
      console.log('\n🔍 Verifying database...');
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `);

      console.log(`\n📊 Total tables in public schema: ${result.rows[0].count}`);

      // Check for callssdk_users
      const callssdkCheck = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name LIKE 'callssdk%'
        ORDER BY table_name
      `);

      console.log(`\n📋 callssdk tables found: ${callssdkCheck.rows.length}`);
      callssdkCheck.rows.forEach(row => console.log(`   - ${row.table_name}`));

      console.log('\n✅ RESTORE COMPLETED!\n');

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await pool.end();
  }
}

restore().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
