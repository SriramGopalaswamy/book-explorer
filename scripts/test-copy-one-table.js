import pg from 'pg';

const { Pool } = pg;

async function copyOneTable() {
  const sourceDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6kktkbh46gs73d0geug-a.oregon-postgres.render.com/testdb_xiqm_d71y';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  const tableName = 'atr_giftcards';

  console.log('🧪 TEST: Copying single table - atr_giftcards');
  console.log('='.repeat(60));
  console.log('');

  const sourcePool = new Pool({ connectionString: sourceDb, ssl: { rejectUnauthorized: false } });
  const destPool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });

  try {
    const sourceClient = await sourcePool.connect();
    const destClient = await destPool.connect();

    try {
      // 1. Count rows in source
      console.log('📊 Checking source database...');
      const sourceCount = await sourceClient.query(`SELECT COUNT(*) as count FROM public."${tableName}"`);
      console.log(`   Source has ${sourceCount.rows[0].count} rows\n`);

      // 2. Drop table if exists in destination
      console.log('🗑️  Dropping table in destination (if exists)...');
      await destClient.query(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`);
      console.log('   ✅ Dropped\n');

      // 3. Get CREATE TABLE statement
      console.log('📋 Getting table structure...');
      const createResult = await sourceClient.query(`
        SELECT
          'CREATE TABLE public."' || $1 || '" (' ||
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
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE
              WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default
              ELSE ''
            END,
            ', ' ORDER BY ordinal_position
          ) || ');' as ddl
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        GROUP BY table_name
      `, [tableName]);

      // 4. Create table in destination
      console.log('🔨 Creating table in destination...');
      await destClient.query(createResult.rows[0].ddl);
      console.log('   ✅ Table created\n');

      // 5. Copy data
      console.log('📦 Copying data...');
      const data = await sourceClient.query(`SELECT * FROM public."${tableName}"`);

      if (data.rows.length > 0) {
        const columns = Object.keys(data.rows[0]);
        const columnNames = columns.map(c => `"${c}"`).join(', ');
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < data.rows.length; i++) {
          try {
            const values = columns.map(col => data.rows[i][col]);
            await destClient.query(
              `INSERT INTO public."${tableName}" (${columnNames}) VALUES (${placeholders})`,
              values
            );
            successCount++;

            if ((i + 1) % 100 === 0) {
              console.log(`   📝 ${i + 1}/${data.rows.length} rows copied...`);
            }
          } catch (error) {
            failCount++;
            if (failCount <= 5) {
              console.log(`   ❌ Row ${i + 1} failed: ${error.message.substring(0, 80)}`);
            }
          }
        }

        console.log(`\n✅ Copy completed!`);
        console.log(`   Success: ${successCount}/${data.rows.length} rows`);

        if (failCount > 0) {
          console.log(`   ⚠️  Failed: ${failCount} rows`);
        }

        // 6. Verify count in destination
        console.log('\n🔍 Verifying...');
        const destCount = await destClient.query(`SELECT COUNT(*) as count FROM public."${tableName}"`);
        console.log(`   Destination now has ${destCount.rows[0].count} rows`);

        if (parseInt(destCount.rows[0].count) === parseInt(sourceCount.rows[0].count)) {
          console.log('\n🎉 SUCCESS! All rows copied correctly!');
        } else {
          console.log(`\n⚠️  WARNING: Row count mismatch!`);
          console.log(`   Expected: ${sourceCount.rows[0].count}`);
          console.log(`   Got: ${destCount.rows[0].count}`);
        }
      }

    } finally {
      sourceClient.release();
      destClient.release();
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

copyOneTable();
