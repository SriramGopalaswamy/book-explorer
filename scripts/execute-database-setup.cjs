const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SCHEMA_NAME = 'grxbooks';
const SQL_FILE = path.join(__dirname, '..', 'supabase', 'grxbooks_complete_setup.sql');

// Method 1: Try to create an RPC function to execute SQL, then use it
async function createExecSQLFunction() {
  console.log('🔧 Attempting to create SQL execution function...\n');
  
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION ${SCHEMA_NAME}.exec_sql(sql_text text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
    END;
    $$;
  `;
  
  try {
    // Try to execute via REST API - this won't work for DDL, but let's try
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql_text: createFunctionSQL })
    });
    
    return response && response.ok;
  } catch (error) {
    return false;
  }
}

// Method 2: Try to execute SQL in chunks via Supabase REST API
async function executeSQLChunks(sql) {
  console.log('📤 Attempting to execute SQL via REST API...\n');
  
  // Split SQL into statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
  
  console.log(`   Found ${statements.length} SQL statements\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < Math.min(statements.length, 10); i++) { // Limit to first 10 for testing
    const statement = statements[i];
    if (statement.length < 10) continue;
    
    try {
      // Try to execute via a generic RPC if it exists
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: statement })
      });
      
      if (response && response.ok) {
        successCount++;
        if (i < 5) console.log(`   ✅ Statement ${i + 1} executed`);
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
    }
  }
  
  if (successCount > 0) {
    console.log(`\n   ✅ Executed ${successCount} statements`);
    console.log(`   ❌ Failed ${failCount} statements\n`);
    return true;
  }
  
  return false;
}

// Method 3: Use Supabase Management API (requires access token)
async function executeViaManagementAPI(sql) {
  console.log('📡 Attempting to use Management API...\n');
  
  // This would require SUPABASE_ACCESS_TOKEN from .env
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.log('   ⚠️  SUPABASE_ACCESS_TOKEN not found in .env\n');
    return false;
  }
  
  try {
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (response && response.ok) {
      console.log('   ✅ SQL executed via Management API\n');
      return true;
    }
  } catch (error) {
    console.log(`   ❌ Management API error: ${error.message}\n`);
  }
  
  return false;
}

async function main() {
  console.log('🚀 Executing Database Setup\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Schema: ${SCHEMA_NAME}\n`);
  
  if (!fs.existsSync(SQL_FILE)) {
    console.error(`❌ SQL file not found: ${SQL_FILE}`);
    console.error('   Please run: node scripts/setup-database-supabase-api.cjs first\n');
    process.exit(1);
  }
  
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  console.log(`📄 Loaded SQL file: ${SQL_FILE}`);
  console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB\n`);
  
  // Try Method 3: Management API
  const method3Success = await executeViaManagementAPI(sql);
  if (method3Success) {
    console.log('✅ Database setup completed via Management API!\n');
    return;
  }
  
  // Try Method 2: REST API chunks
  const method2Success = await executeSQLChunks(sql);
  if (method2Success) {
    console.log('⚠️  Partial execution via REST API (limited functionality)\n');
    console.log('📋 For full setup, please run the SQL file manually:\n');
    console.log(`   1. Open: ${SQL_FILE}`);
    console.log(`   2. Copy contents to Supabase SQL Editor`);
    console.log(`   3. Execute\n`);
    return;
  }
  
  // Method 1: Try to create function (won't work for DDL)
  const method1Success = await createExecSQLFunction();
  
  // If all methods fail, provide manual instructions
  console.log('⚠️  Automatic execution not available\n');
  console.log('📋 Manual Execution Required:\n');
  console.log('   Supabase requires direct database access for DDL operations.');
  console.log('   Please execute the SQL file manually:\n');
  console.log(`   1. Open Supabase Dashboard:`);
  console.log(`      https://supabase.com/dashboard/project/qfgudhbrjfjmbamwsfuj/sql/new\n`);
  console.log(`   2. Open the SQL file:`);
  console.log(`      ${SQL_FILE}\n`);
  console.log(`   3. Copy all contents (Ctrl+A, Ctrl+C)`);
  console.log(`   4. Paste into SQL Editor`);
  console.log(`   5. Click "Run" (or press Ctrl+Enter)`);
  console.log(`   6. Wait for execution (1-2 minutes)\n`);
  console.log(`   ✅ This will create the ${SCHEMA_NAME} schema, all tables, and seed data.\n`);
  
  // Also provide option to add database password
  console.log('💡 Alternative: Add database password to .env for automatic execution:\n');
  console.log('   1. Get connection string from:');
  console.log('      https://supabase.com/dashboard/project/qfgudhbrjfjmbamwsfuj/settings/database\n');
  console.log('   2. Add to .env:');
  console.log('      SUPABASE_DATABASE_URL="postgresql://postgres:[PASSWORD]@db.qfgudhbrjfjmbamwsfuj.supabase.co:5432/postgres"\n');
  console.log('   3. Then run: node scripts/setup-database-backend.cjs\n');
}

main();
