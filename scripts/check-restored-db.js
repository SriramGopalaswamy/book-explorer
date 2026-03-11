import pg from 'pg';

const { Pool } = pg;

async function checkRestoredDB() {
  // Original database
  const originalPool = new Pool({
    connectionString: 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm',
    ssl: { rejectUnauthorized: false }
  });

  // Restored database
  const restoredPool = new Pool({
    connectionString: 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6kkaonafjfc73egarg0-a.oregon-postgres.render.com/testdb_xiqm_hepq',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking RESTORED database (testdb_xiqm_hepq)...\n');
    const restoredClient = await restoredPool.connect();

    try {
      // Check schemas
      const schemasResult = await restoredClient.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schema_name
      `);

      console.log('📊 Schemas in RESTORED database:');
      schemasResult.rows.forEach(row => console.log('  -', row.schema_name));

      // Check tables per schema
      const tablesResult = await restoredClient.query(`
        SELECT table_schema, COUNT(*) as table_count
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY table_schema
        ORDER BY table_schema
      `);

      console.log('\n📋 Tables per schema in RESTORED database:');
      tablesResult.rows.forEach(row => {
        console.log(`  ${row.table_schema}: ${row.table_count} tables`);
      });

      // Check public schema tables
      const publicTablesResult = await restoredClient.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      console.log('\n✅ Tables in PUBLIC schema (RESTORED):');
      publicTablesResult.rows.forEach(row => console.log('  -', row.table_name));

      // Check if callssdk_users exists
      const callssdkCheck = await restoredClient.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'callssdk_users'
      `);

      if (callssdkCheck.rows[0].count > 0) {
        console.log('\n🎉 SUCCESS: callssdk_users table found in restored database!');
      } else {
        console.log('\n⚠️  WARNING: callssdk_users table NOT found in restored database');
      }

    } finally {
      restoredClient.release();
    }

    console.log('\n\n🔍 Checking CURRENT database (testdb_xiqm)...\n');
    const originalClient = await originalPool.connect();

    try {
      // Check public schema in current DB
      const currentPublicResult = await originalClient.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      console.log(`📊 Current database has ${currentPublicResult.rows[0].count} tables in public schema`);

    } finally {
      originalClient.release();
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await originalPool.end();
    await restoredPool.end();
  }
}

checkRestoredDB();
