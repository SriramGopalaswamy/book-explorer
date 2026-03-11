import pg from 'pg';

const { Pool } = pg;

async function copyPublicTables() {
  const sourcePool = new Pool({
    connectionString: 'postgresql://admin:SQgKTxNyCQWC7YxvaRQXqjAvIozS3Fci@dpg-d117rc15pdvs73emkj30-a.singapore-postgres.render.com/bdb_cecs',
    ssl: { rejectUnauthorized: false }
  });

  const destPool = new Pool({
    connectionString: 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm',
    ssl: { rejectUnauthorized: false }
  });

  try {
    const sourceClient = await sourcePool.connect();
    const destClient = await destPool.connect();

    try {
      console.log('📋 Getting tables from source database...\n');

      // Get all tables from source public schema
      const tablesResult = await sourceClient.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      console.log(`Found ${tablesResult.rows.length} tables to copy\n`);

      for (const row of tablesResult.rows) {
        const tableName = row.table_name;
        console.log(`\n📦 Copying table: ${tableName}`);

        try {
          // Get CREATE TABLE statement
          const createResult = await sourceClient.query(`
            SELECT
              'CREATE TABLE IF NOT EXISTS public."' || table_name || '" (' ||
              string_agg(
                '"' || column_name || '" ' ||
                data_type ||
                CASE
                  WHEN character_maximum_length IS NOT NULL
                  THEN '(' || character_maximum_length || ')'
                  ELSE ''
                END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
                ', '
              ) || ');' as create_statement
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            GROUP BY table_name
          `, [tableName]);

          // Create table in destination
          if (createResult.rows.length > 0) {
            await destClient.query(createResult.rows[0].create_statement);
            console.log(`  ✅ Created table structure`);
          }

          // Copy data
          const dataResult = await sourceClient.query(`SELECT * FROM public."${tableName}"`);

          if (dataResult.rows.length > 0) {
            const columns = Object.keys(dataResult.rows[0]);
            const columnNames = columns.map(c => `"${c}"`).join(', ');

            for (const dataRow of dataResult.rows) {
              const values = columns.map(col => dataRow[col]);
              const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

              await destClient.query(
                `INSERT INTO public."${tableName}" (${columnNames}) VALUES (${placeholders})`,
                values
              );
            }

            console.log(`  ✅ Copied ${dataResult.rows.length} rows`);
          } else {
            console.log(`  ℹ️  Table is empty`);
          }

        } catch (error) {
          console.error(`  ❌ Error: ${error.message}`);
        }
      }

      console.log('\n✅ Copy completed!');

    } finally {
      sourceClient.release();
      destClient.release();
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

console.log('🔄 Copying public tables from bdb_cecs to testdb_xiqm\n');
copyPublicTables();
