import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function restore() {
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';
  const dumpFile = 'C:\\Users\\damod\\Downloads\\book-explorer\\scripts\\public-schema-dump.sql';

  console.log('📤 Restoring public schema to testdb...\n');
  console.log('Reading dump file (53MB)...\n');

  const pool = new Pool({
    connectionString: destDb,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60000,
    query_timeout: 300000
  });

  try {
    const client = await pool.connect();

    try {
      const sqlContent = fs.readFileSync(dumpFile, 'utf-8');
      const statements = sqlContent.split(';\n').filter(s => s.trim());

      console.log(`Found ${statements.length} SQL statements\n`);
      console.log('Executing statements...\n');

      let successCount = 0;
      let errorCount = 0;
      let lastProgress = 0;

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;

        try {
          await client.query(stmt + ';');
          successCount++;

          const progress = Math.floor((i / statements.length) * 100);
          if (progress >= lastProgress + 10) {
            console.log(`Progress: ${progress}% (${i}/${statements.length} statements)`);
            lastProgress = progress;
          }
        } catch (error) {
          errorCount++;
          if (errorCount <= 20) {
            const tableName = stmt.match(/INTO public\."(\w+)"/)?.[1] ||
                            stmt.match(/TABLE.*public\."(\w+)"/)?.[1] || 'unknown';
            console.error(`  ⚠️  Error in ${tableName}: ${error.message.substring(0, 80)}`);
          }
        }
      }

      console.log(`\n✅ Restore completed!`);
      console.log(`   Success: ${successCount} statements`);
      console.log(`   Errors: ${errorCount} statements`);
      console.log(`   Success rate: ${((successCount / statements.length) * 100).toFixed(1)}%`);

      // Verify tables were created
      console.log('\n🔍 Verifying tables...');
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `);

      console.log(`\n📊 Total tables in public schema: ${result.rows[0].count}`);

      // Check for callssdk_users specifically
      const callssdkCheck = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'callssdk_users'
      `);

      if (callssdkCheck.rows[0].count > 0) {
        console.log('✅ callssdk_users table restored successfully!');
      }

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

restore();
