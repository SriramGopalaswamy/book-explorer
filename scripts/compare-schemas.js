import pg from 'pg';

const { Pool } = pg;

async function compareSchemas() {
  const sourceDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6kktkbh46gs73d0geug-a.oregon-postgres.render.com/testdb_xiqm_d71y';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  const tableName = 'atr_giftcards';

  const sourcePool = new Pool({ connectionString: sourceDb, ssl: { rejectUnauthorized: false } });
  const destPool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });

  try {
    const sourceClient = await sourcePool.connect();
    const destClient = await destPool.connect();

    try {
      console.log('🔍 Comparing schema for atr_giftcards\n');

      // Get schema from source
      console.log('SOURCE DATABASE (testdb_xiqm_d71y):');
      const sourceSchema = await sourceClient.query(`
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      sourceSchema.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} (${col.udt_name})`);
      });

      // Get schema from destination
      console.log('\nDESTINATION DATABASE (testdb_xiqm):');
      const destSchema = await destClient.query(`
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      if (destSchema.rows.length > 0) {
        destSchema.rows.forEach(col => {
          console.log(`  ${col.column_name}: ${col.data_type} (${col.udt_name})`);
        });

        // Find differences
        console.log('\n📊 DIFFERENCES:');
        let hasDiff = false;
        sourceSchema.rows.forEach(sourceCol => {
          const destCol = destSchema.rows.find(d => d.column_name === sourceCol.column_name);
          if (!destCol) {
            console.log(`  ❌ Column missing in dest: ${sourceCol.column_name}`);
            hasDiff = true;
          } else if (sourceCol.udt_name !== destCol.udt_name) {
            console.log(`  ⚠️  ${sourceCol.column_name}: ${sourceCol.udt_name} → ${destCol.udt_name}`);
            hasDiff = true;
          }
        });

        if (!hasDiff) {
          console.log('  ✅ No differences found');
        }
      } else {
        console.log('  (table does not exist yet)');
      }

      // Sample first row from source
      console.log('\n📝 Sample row from SOURCE:');
      const sample = await sourceClient.query(`SELECT * FROM public."${tableName}" LIMIT 1`);
      if (sample.rows.length > 0) {
        const row = sample.rows[0];
        Object.keys(row).forEach(key => {
          const value = row[key];
          const type = typeof value;
          const display = type === 'object' ? JSON.stringify(value).substring(0, 50) : String(value).substring(0, 50);
          console.log(`  ${key}: ${display} (${type})`);
        });
      }

    } finally {
      sourceClient.release();
      destClient.release();
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

compareSchemas();
