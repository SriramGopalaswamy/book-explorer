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

async function fixAndImportSQL() {
  const sqlFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';

  console.log('🔍 Reading SQL dump file...');
  let sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

  console.log('📊 Original file size:', (sqlContent.length / 1024 / 1024).toFixed(2), 'MB');
  console.log('📝 Total lines:', sqlContent.split('\n').length);

  // Fix syntax issues
  console.log('\n🔧 Fixing SQL syntax issues...');

  // Count ARRAY occurrences before fix
  const arrayMatches = sqlContent.match(/ ARRAY[\s,]/g);
  console.log(`   Found ${arrayMatches ? arrayMatches.length : 0} ARRAY type declarations`);

  // Fix all ARRAY type declarations
  // Pattern: "column_name" ARRAY followed by comma, NOT NULL, DEFAULT, or newline
  sqlContent = sqlContent.replace(/(\s+"[^"]+"\s+)ARRAY(\s*(?:NOT NULL|DEFAULT|,|\)|$))/g, '$1text[]$2');
  console.log('   ✅ Fixed ARRAY type declarations to text[]');

  // Fix USER-DEFINED types (custom enums that aren't exported)
  const userDefinedMatches = sqlContent.match(/USER-DEFINED/g);
  console.log(`   Found ${userDefinedMatches ? userDefinedMatches.length : 0} USER-DEFINED type declarations`);
  sqlContent = sqlContent.replace(/USER-DEFINED/g, 'text');
  console.log('   ✅ Fixed USER-DEFINED type declarations to text');

  // Fix extensions schema references (Supabase-specific)
  const extensionsMatches = sqlContent.match(/extensions\./g);
  console.log(`   Found ${extensionsMatches ? extensionsMatches.length : 0} extensions schema references`);
  // Replace extensions.gen_random_bytes() with gen_random_uuid() since we're using UUIDs
  sqlContent = sqlContent.replace(/encode\(extensions\.gen_random_bytes\(\d+\),\s*'hex'::text\)/g, 'gen_random_uuid()::text');
  console.log('   ✅ Fixed extensions schema references');

  // Remove duplicate primary key index creations
  // These conflict with PRIMARY KEY constraints in CREATE TABLE statements
  const pkeyIndexMatches = sqlContent.match(/CREATE UNIQUE INDEX \w+_pkey ON/g);
  console.log(`   Found ${pkeyIndexMatches ? pkeyIndexMatches.length : 0} duplicate primary key indexes`);
  sqlContent = sqlContent.replace(/CREATE UNIQUE INDEX \w+_pkey ON public\.\w+ USING btree \([^)]+\);[\r\n]*/g, '');
  console.log('   ✅ Removed duplicate primary key indexes');

  // Save fixed SQL to temp file
  const fixedSqlPath = path.join(__dirname, 'temp-fixed-dump.sql');
  fs.writeFileSync(fixedSqlPath, sqlContent);
  console.log('💾 Saved fixed SQL to:', fixedSqlPath);

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

      // Check if there are existing tables
      const existingTablesResult = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      const existingTableCount = parseInt(existingTablesResult.rows[0].count);

      if (existingTableCount > 0) {
        console.log(`⚠️  Found ${existingTableCount} existing tables in database`);
        console.log('🧹 Dropping all existing tables...');

        // Drop all tables in public schema
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

      console.log('\n🚀 Starting import...\n');

      // Disable foreign key checks temporarily
      console.log('⚙️  Disabling foreign key checks...');
      await client.query('SET session_replication_role = replica;');

      // Execute the SQL dump
      const startTime = Date.now();
      await client.query(sqlContent);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Re-enable foreign key checks
      console.log('⚙️  Re-enabling foreign key checks...');
      await client.query('SET session_replication_role = DEFAULT;');

      console.log('\n✅ Import completed successfully!');
      console.log(`⏱️  Duration: ${duration} seconds`);

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
    console.error('\n❌ Error during import:', error.message);

    if (error.position) {
      const position = parseInt(error.position);
      const context = sqlContent.substring(Math.max(0, position - 100), position + 100);
      console.error('\n📍 Error context around position', position);
      console.error(context);
    }

    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();

    // Clean up temp file
    if (fs.existsSync(fixedSqlPath)) {
      fs.unlinkSync(fixedSqlPath);
      console.log('\n🧹 Cleaned up temporary files');
    }
  }
}

console.log('🗃️  PostgreSQL Database Import Tool (with Auto-Fix)');
console.log('====================================================\n');

fixAndImportSQL().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
