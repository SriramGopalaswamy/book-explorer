import pg from 'pg';

const { Pool } = pg;

async function checkStatus() {
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  const pool = new Pool({
    connectionString: destDb,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    try {
      console.log('🔍 Checking current state of testdb public schema...\n');

      // Count tables
      const tablesResult = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `);

      console.log(`📊 Tables in public schema: ${tablesResult.rows[0].count}\n`);

      // List some tables
      const listResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT 20
      `);

      console.log('📋 Sample tables:');
      listResult.rows.forEach(row => console.log(`  - ${row.table_name}`));

      // Check for callssdk_users
      const callssdkCheck = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'callssdk_users'
      `);

      if (callssdkCheck.rows[0].count > 0) {
        const rowCount = await client.query(`SELECT COUNT(*) as count FROM public.callssdk_users`);
        console.log(`\n✅ callssdk_users exists with ${rowCount.rows[0].count} rows`);
      } else {
        console.log('\n❌ callssdk_users NOT found');
      }

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkStatus();
