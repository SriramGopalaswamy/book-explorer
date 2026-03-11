import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

async function copyPublicSchema() {
  const sourceDb = 'postgresql://admin:SQgKTxNyCQWC7YxvaRQXqjAvIozS3Fci@dpg-d117rc15pdvs73emkj30-a.singapore-postgres.render.com/bdb_cecs';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  const dumpFile = 'C:\\Users\\damod\\Downloads\\book-explorer\\scripts\\public-schema-dump.sql';

  try {
    console.log('📥 Dumping public schema from source database...\n');

    // Try pg_dump first
    try {
      await execAsync(`pg_dump "${sourceDb}" --schema=public --no-owner --no-acl -f "${dumpFile}"`);
      console.log('✅ Dump completed using pg_dump\n');
    } catch (error) {
      console.log('⚠️  pg_dump not found, using pg library instead...\n');

      // Fall back to manual export
      const pg = await import('pg');
      const { Pool } = pg.default;

      const sourcePool = new Pool({
        connectionString: sourceDb,
        ssl: { rejectUnauthorized: false }
      });

      const client = await sourcePool.connect();
      let sqlContent = '';

      try {
        // Export sequences
        const seqResult = await client.query(`
          SELECT sequence_name
          FROM information_schema.sequences
          WHERE sequence_schema = 'public'
        `);

        for (const row of seqResult.rows) {
          const seqData = await client.query(`
            SELECT last_value, is_called FROM public."${row.sequence_name}"
          `);
          sqlContent += `CREATE SEQUENCE IF NOT EXISTS public."${row.sequence_name}";\n`;
          if (seqData.rows[0].is_called) {
            sqlContent += `SELECT setval('public."${row.sequence_name}"', ${seqData.rows[0].last_value}, true);\n`;
          }
        }

        // Export tables
        const tablesResult = await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);

        for (const table of tablesResult.rows) {
          const tableName = table.table_name;

          // Get full table definition
          const tableDefResult = await client.query(`
            SELECT
              'CREATE TABLE IF NOT EXISTS public."' || $1 || '" (' ||
              string_agg(
                '"' || column_name || '" ' ||
                udt_name ||
                CASE
                  WHEN character_maximum_length IS NOT NULL
                    THEN '(' || character_maximum_length || ')'
                  WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
                    THEN '(' || numeric_precision || ',' || numeric_scale || ')'
                  ELSE ''
                END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE
                  WHEN column_default LIKE 'nextval%'
                    THEN ' DEFAULT ' || column_default
                  WHEN column_default IS NOT NULL
                    THEN ' DEFAULT ' || column_default
                  ELSE ''
                END,
                ', ' ORDER BY ordinal_position
              ) || ');' as ddl
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            GROUP BY table_name
          `, [tableName]);

          if (tableDefResult.rows.length > 0) {
            sqlContent += `\n${tableDefResult.rows[0].ddl}\n`;

            // Get data
            const dataResult = await client.query(`SELECT * FROM public."${tableName}"`);

            if (dataResult.rows.length > 0) {
              const columns = Object.keys(dataResult.rows[0]);
              const columnNames = columns.map(c => `"${c}"`).join(', ');

              for (const row of dataResult.rows) {
                const values = columns.map(col => {
                  if (row[col] === null) return 'NULL';
                  if (typeof row[col] === 'object') return `'${JSON.stringify(row[col]).replace(/'/g, "''")}'::jsonb`;
                  if (typeof row[col] === 'string') return `'${row[col].replace(/'/g, "''")}'`;
                  return row[col];
                });

                sqlContent += `INSERT INTO public."${tableName}" (${columnNames}) VALUES (${values.join(', ')});\n`;
              }
            }
          }
        }

        fs.writeFileSync(dumpFile, sqlContent);
        console.log('✅ Manual dump completed\n');

      } finally {
        client.release();
        await sourcePool.end();
      }
    }

    console.log('📤 Restoring to destination database...\n');

    try {
      await execAsync(`psql "${destDb}" -f "${dumpFile}"`);
      console.log('✅ Restore completed using psql\n');
    } catch (error) {
      console.log('⚠️  psql not found, using pg library...\n');

      const pg = await import('pg');
      const { Pool } = pg.default;

      const destPool = new Pool({
        connectionString: destDb,
        ssl: { rejectUnauthorized: false }
      });

      const client = await destPool.connect();

      try {
        const sqlContent = fs.readFileSync(dumpFile, 'utf-8');
        await client.query(sqlContent);
        console.log('✅ Restore completed\n');
      } finally {
        client.release();
        await destPool.end();
      }
    }

    console.log('✅ Public schema copied successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

copyPublicSchema();
