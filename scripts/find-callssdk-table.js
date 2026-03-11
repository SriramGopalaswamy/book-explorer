import pg from 'pg';

const { Pool } = pg;

async function findTable() {
  const restoredPool = new Pool({
    connectionString: 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6kkaonafjfc73egarg0-a.oregon-postgres.render.com/testdb_xiqm_hepq',
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await restoredPool.connect();

    try {
      console.log('🔍 Searching for callssdk_users table in ALL schemas...\n');

      // Search for table in all schemas
      const searchResult = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_name LIKE '%callssdk%' OR table_name LIKE '%calls%'
        ORDER BY table_schema, table_name
      `);

      if (searchResult.rows.length > 0) {
        console.log('📋 Found tables matching "calls":\n');
        searchResult.rows.forEach(row => {
          console.log(`  ${row.table_schema}.${row.table_name}`);
        });
      } else {
        console.log('❌ No tables found matching "callssdk" or "calls"\n');
      }

      // Search for any table with "user" in name
      console.log('\n🔍 Searching for tables with "user" in name...\n');
      const userTablesResult = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_name LIKE '%user%'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);

      console.log('📋 Found tables with "user" in name:\n');
      userTablesResult.rows.forEach(row => {
        console.log(`  ${row.table_schema}.${row.table_name}`);
      });

      // List ALL tables in all schemas
      console.log('\n\n📊 ALL TABLES IN ALL SCHEMAS:\n');
      const allTablesResult = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);

      let currentSchema = '';
      allTablesResult.rows.forEach(row => {
        if (row.table_schema !== currentSchema) {
          currentSchema = row.table_schema;
          console.log(`\n${currentSchema}:`);
        }
        console.log(`  - ${row.table_name}`);
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await restoredPool.end();
  }
}

findTable();
