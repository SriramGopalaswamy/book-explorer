import pg from 'pg';

const { Pool } = pg;

async function copyTableByTable() {
  const sourceDb = 'postgresql://admin:SQgKTxNyCQWC7YxvaRQXqjAvIozS3Fci@dpg-d117rc15pdvs73emkj30-a.singapore-postgres.render.com/bdb_cecs';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  const sourcePool = new Pool({ connectionString: sourceDb, ssl: { rejectUnauthorized: false } });
  const destPool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });

  console.log('='.repeat(60));
  console.log('COPYING PUBLIC SCHEMA TABLE-BY-TABLE');
  console.log('='.repeat(60));
  console.log('');

  try {
    const sourceClient = await sourcePool.connect();
    const destClient = await destPool.connect();

    try {
      // Get all tables
      const tablesResult = await sourceClient.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      console.log(`📊 Found ${tablesResult.rows.length} tables to copy\n`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tablesResult.rows.length; i++) {
        const tableName = tablesResult.rows[i].table_name;
        console.log(`\n[${i + 1}/${tablesResult.rows.length}] ${tableName}`);

        try {
          // Get CREATE TABLE statement with exact types
          const createStmt = await sourceClient.query(`
            SELECT
              'CREATE TABLE IF NOT EXISTS public."' || $1 || '" (' ||
              string_agg(
                '"' || column_name || '" ' ||
                data_type ||
                CASE
                  WHEN data_type = 'character varying' AND character_maximum_length IS NOT NULL
                    THEN '(' || character_maximum_length || ')'
                  WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL
                    THEN '(' || numeric_precision || COALESCE(',' || numeric_scale, '') || ')'
                  ELSE ''
                END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                ', ' ORDER BY ordinal_position
              ) || ');' as ddl
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            GROUP BY table_name
          `, [tableName]);

          if (createStmt.rows.length > 0) {
            // Create table
            await destClient.query(createStmt.rows[0].ddl);
            console.log(`   ✅ Table created`);

            // Count rows
            const countResult = await sourceClient.query(`SELECT COUNT(*) as count FROM public."${tableName}"`);
            const rowCount = parseInt(countResult.rows[0].count);

            if (rowCount > 0) {
              console.log(`   📊 Copying ${rowCount} rows...`);

              // Copy data using native query (slower but reliable)
              const dataResult = await sourceClient.query(`SELECT * FROM public."${tableName}"`);

              if (dataResult.rows.length > 0) {
                const columns = Object.keys(dataResult.rows[0]);
                const columnNames = columns.map(c => `"${c}"`).join(', ');
                const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

                let insertedCount = 0;
                for (const row of dataResult.rows) {
                  try {
                    const values = columns.map(col => row[col]);
                    await destClient.query(
                      `INSERT INTO public."${tableName}" (${columnNames}) VALUES (${placeholders})`,
                      values
                    );
                    insertedCount++;

                    if (insertedCount % 100 === 0) {
                      process.stdout.write(`\r   📝 ${insertedCount}/${rowCount} rows copied...`);
                    }
                  } catch (insertError) {
                    // Skip individual rows that fail
                  }
                }

                console.log(`\r   ✅ Copied ${insertedCount}/${rowCount} rows`);
              }
            } else {
              console.log(`   ℹ️  Table is empty`);
            }

            successCount++;
          }
        } catch (error) {
          console.log(`   ❌ Error: ${error.message.substring(0, 100)}`);
          errorCount++;
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('COPY SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total tables: ${tablesResult.rows.length}`);
      console.log(`✅ Success: ${successCount}`);
      console.log(`❌ Errors: ${errorCount}`);

      // Verify
      const finalCount = await destClient.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);

      console.log(`\n📊 Final table count in destination: ${finalCount.rows[0].count}`);

    } finally {
      sourceClient.release();
      destClient.release();
    }
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

copyTableByTable();
