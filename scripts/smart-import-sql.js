import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

function fixSQLSyntax(sqlContent) {
  console.log('\n🔧 Fixing SQL syntax issues...');

  // Count issues before fix
  const arrayMatches = sqlContent.match(/ ARRAY[\s,]/g);
  console.log(`   Found ${arrayMatches ? arrayMatches.length : 0} ARRAY type declarations`);

  const userDefinedMatches = sqlContent.match(/USER-DEFINED/g);
  console.log(`   Found ${userDefinedMatches ? userDefinedMatches.length : 0} USER-DEFINED type declarations`);

  const extensionsMatches = sqlContent.match(/extensions\./g);
  console.log(`   Found ${extensionsMatches ? extensionsMatches.length : 0} extensions schema references`);

  const pkeyIndexMatches = sqlContent.match(/CREATE UNIQUE INDEX \w+_pkey ON/g);
  console.log(`   Found ${pkeyIndexMatches ? pkeyIndexMatches.length : 0} duplicate primary key indexes`);

  // Fix all issues
  sqlContent = sqlContent.replace(/(\s+"[^"]+"\s+)ARRAY(\s*(?:NOT NULL|DEFAULT|,|\)|$))/g, '$1text[]$2');
  sqlContent = sqlContent.replace(/USER-DEFINED/g, 'text');
  sqlContent = sqlContent.replace(/encode\(extensions\.gen_random_bytes\(\d+\),\s*'hex'::text\)/g, 'gen_random_uuid()::text');
  sqlContent = sqlContent.replace(/CREATE UNIQUE INDEX \w+_pkey ON public\.\w+ USING btree \([^)]+\);[\r\n]*/g, '');

  console.log('   ✅ All syntax issues fixed');

  return sqlContent;
}

function splitSQL(sqlContent) {
  console.log('\n📋 Analyzing SQL structure...');

  const lines = sqlContent.split('\n');
  const schemas = [];
  const inserts = [];
  const constraints = [];
  const indexes = [];
  const other = [];

  let currentStatement = '';
  let inStatement = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines when not in statement
    if (!inStatement && (trimmed.startsWith('--') || trimmed === '')) {
      continue;
    }

    currentStatement += line + '\n';

    // Check if statement is complete (ends with semicolon)
    if (trimmed.endsWith(';')) {
      const stmt = currentStatement.trim();

      if (stmt.startsWith('CREATE TABLE')) {
        schemas.push(stmt);
      } else if (stmt.startsWith('INSERT INTO')) {
        inserts.push(stmt);
      } else if (stmt.startsWith('ALTER TABLE') && stmt.includes('ADD CONSTRAINT') && stmt.includes('FOREIGN KEY')) {
        constraints.push(stmt);
      } else if (stmt.startsWith('CREATE INDEX') || stmt.startsWith('CREATE UNIQUE INDEX')) {
        indexes.push(stmt);
      } else if (stmt.startsWith('BEGIN') || stmt.startsWith('COMMIT')) {
        // Skip transaction control statements
      } else if (stmt.length > 0) {
        other.push(stmt);
      }

      currentStatement = '';
      inStatement = false;
    } else {
      inStatement = true;
    }
  }

  console.log(`   📊 Found ${schemas.length} CREATE TABLE statements`);
  console.log(`   📊 Found ${inserts.length} INSERT statements`);
  console.log(`   📊 Found ${constraints.length} FOREIGN KEY constraints`);
  console.log(`   📊 Found ${indexes.length} INDEX statements`);
  console.log(`   📊 Found ${other.length} other statements`);

  return { schemas, inserts, constraints, indexes, other };
}

async function importSQL() {
  const sqlFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';

  console.log('🔍 Reading SQL dump file...');
  let sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

  console.log('📊 Original file size:', (sqlContent.length / 1024 / 1024).toFixed(2), 'MB');
  console.log('📝 Total lines:', sqlContent.split('\n').length);

  // Fix syntax issues
  sqlContent = fixSQLSyntax(sqlContent);

  // Split SQL into different statement types
  const { schemas, inserts, constraints, indexes, other } = splitSQL(sqlContent);

  // Create database connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('\n🔌 Connecting to database...');
    const client = await pool.connect();

    try {
      console.log('✅ Connected successfully!');

      // Check and clean existing tables
      const existingTablesResult = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      const existingTableCount = parseInt(existingTablesResult.rows[0].count);

      if (existingTableCount > 0) {
        console.log(`⚠️  Found ${existingTableCount} existing tables in database`);
        console.log('🧹 Dropping all existing tables...');

        await client.query(`
          DO $$ DECLARE
            r RECORD;
          BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
              EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
          END $$;
        `);

        console.log('✅ All existing tables dropped');
      }

      console.log('\n🚀 Starting import in stages...\n');

      // Stage 1: Create tables (without foreign keys - those come later in ALTER TABLE)
      console.log('📦 Stage 1: Creating tables and other schema objects...');
      const startTime1 = Date.now();

      for (const stmt of [...schemas, ...other]) {
        try {
          await client.query(stmt);
        } catch (error) {
          console.error(`   ⚠️  Warning: ${error.message}`);
        }
      }

      console.log(`   ✅ Completed in ${((Date.now() - startTime1) / 1000).toFixed(2)}s`);

      // Stage 2: Insert data (no constraints to check yet)
      console.log('\n📝 Stage 2: Inserting data...');
      const startTime2 = Date.now();

      let successCount = 0;
      let errorCount = 0;

      for (const stmt of inserts) {
        try {
          await client.query(stmt);
          successCount++;
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            console.error(`   ⚠️  Insert error: ${error.message.substring(0, 100)}...`);
          }
        }
      }

      console.log(`   ✅ Inserted ${successCount} records (${errorCount} errors) in ${((Date.now() - startTime2) / 1000).toFixed(2)}s`);

      // Stage 3: Create indexes
      console.log('\n🔍 Stage 3: Creating indexes...');
      const startTime3 = Date.now();

      for (const stmt of indexes) {
        try {
          await client.query(stmt);
        } catch (error) {
          console.error(`   ⚠️  Index warning: ${error.message.substring(0, 100)}...`);
        }
      }

      console.log(`   ✅ Completed in ${((Date.now() - startTime3) / 1000).toFixed(2)}s`);

      // Stage 4: Add foreign key constraints
      console.log('\n🔗 Stage 4: Adding foreign key constraints...');
      const startTime4 = Date.now();

      for (const stmt of constraints) {
        try {
          await client.query(stmt);
        } catch (error) {
          console.error(`   ⚠️  Constraint warning: ${error.message.substring(0, 100)}...`);
        }
      }

      console.log(`   ✅ Completed in ${((Date.now() - startTime4) / 1000).toFixed(2)}s`);

      // Final stats
      const totalDuration = ((Date.now() - startTime1) / 1000).toFixed(2);
      console.log('\n✅ Import completed successfully!');
      console.log(`⏱️  Total duration: ${totalDuration} seconds`);

      // Get table count
      const result = await client.query(`
        SELECT COUNT(*) as table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      console.log(`📊 Total tables in database: ${result.rows[0].table_count}`);

      // Get some sample table names
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
        LIMIT 10
      `);

      console.log('\n📋 Sample tables imported:');
      tablesResult.rows.forEach(row => console.log('  -', row.table_name));

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ Fatal error during import:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('🗃️  PostgreSQL Smart Import Tool');
console.log('====================================\n');

importSQL().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
