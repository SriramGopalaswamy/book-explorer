const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Known tables to check
const KNOWN_TABLES = [
  'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
  'organizations', 'organization_members', 'organization_compliance', 'organization_integrations', 'organization_roles',
  'employees', 'goals', 'memos', 'attendance', 'attendance_shifts', 'attendance_parse_diagnostics',
  'leave_balances', 'leave_requests', 'employee_tax_settings', 'investment_declarations',
  'master_ctc_components', 'payslip_disputes', 'profile_change_requests', 'payroll_records', 'payroll_components',
  'invoices', 'invoice_items', 'bank_accounts', 'bank_transactions', 'bank_transfer_batches',
  'scheduled_payments', 'chart_of_accounts', 'journal_entries', 'journal_entry_items',
  'vendors', 'bills', 'payments', 'credits', 'budgets', 'cost_centers',
  'tax_regimes', 'tax_slabs', 'form16_records',
  'audit_logs', 'audit_compliance_runs', 'audit_compliance_checks', 'audit_risk_themes',
  'audit_ai_anomalies', 'audit_ai_samples', 'audit_ai_narratives', 'audit_pack_exports', 'audit_ifc_assessments',
  'control_account_overrides', 'period_close_logs', 'subledger_reconciliation_log',
  'subscriptions', 'subscription_keys', 'subscription_redemptions',
  'payroll_bulk_uploads', 'payroll_bulk_upload_rows',
  'attendance_bulk_uploads', 'attendance_bulk_upload_rows',
  'roles_bulk_uploads', 'roles_bulk_upload_rows',
];

// Get table structure by querying a sample row
async function getTableStructure(tableName, schema = 'public') {
  try {
    // Try to get one row to infer structure
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return { exists: false, error: 'Table does not exist' };
      }
      return { exists: true, error: error.message, columns: null };
    }
    
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]).map(col => ({
        name: col,
        type: typeof data[0][col],
        sampleValue: data[0][col]
      }));
      return { exists: true, columns, rowCount: null };
    }
    
    // Table exists but is empty - try to get column info via a different method
    // Use REST API to get table info
    const infoResponse = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?limit=0`, {
      method: 'HEAD',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      }
    });
    
    return { exists: true, columns: [], rowCount: 0, empty: true };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

// Get table row count
async function getTableRowCount(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      return null;
    }
    
    return count;
  } catch (error) {
    return null;
  }
}

// Query information_schema via REST API (if possible)
async function queryInformationSchema() {
  console.log('🔍 Attempting to query information_schema...\n');
  
  try {
    // Try to query via a custom RPC if it exists
    const { data, error } = await supabase.rpc('get_tables', {});
    
    if (!error && data) {
      return data;
    }
  } catch (error) {
    // RPC doesn't exist, continue with other methods
  }
  
  return null;
}

// Discover tables by trying to query them
async function discoverTables() {
  console.log('🔍 Discovering tables...\n');
  
  const existingTables = [];
  const tableStructures = {};
  
  for (const table of KNOWN_TABLES) {
    const structure = await getTableStructure(table);
    
    if (structure.exists) {
      existingTables.push(table);
      const rowCount = await getTableRowCount(table);
      tableStructures[table] = {
        ...structure,
        rowCount: rowCount !== null ? rowCount : 'unknown'
      };
    }
  }
  
  return { existingTables, tableStructures };
}

async function main() {
  console.log('📊 Reading Database Structure\n');
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);
  console.log('='.repeat(80));
  
  try {
    // Try information_schema first
    const schemaData = await queryInformationSchema();
    
    // Discover tables
    const { existingTables, tableStructures } = await discoverTables();
    
    console.log(`\n📋 Found ${existingTables.length} accessible tables\n`);
    console.log('='.repeat(80));
    
    // Display table structures
    for (let i = 0; i < existingTables.length; i++) {
      const tableName = existingTables[i];
      const structure = tableStructures[tableName];
      
      console.log(`\n[${i + 1}/${existingTables.length}] 📋 Table: ${tableName}`);
      console.log('-'.repeat(80));
      
      if (structure.error && !structure.columns) {
        console.log(`   ⚠️  ${structure.error}`);
        continue;
      }
      
      if (structure.empty) {
        console.log(`   📭 Empty table (0 rows)`);
        continue;
      }
      
      console.log(`   📊 Row count: ${structure.rowCount !== null ? structure.rowCount : 'unknown'}`);
      
      if (structure.columns && structure.columns.length > 0) {
        console.log(`   📑 Columns (${structure.columns.length}):`);
        structure.columns.forEach(col => {
          const sample = col.sampleValue !== null && col.sampleValue !== undefined
            ? String(col.sampleValue).substring(0, 50)
            : 'NULL';
          console.log(`      • ${col.name.padEnd(30)} (${col.type}) - Sample: ${sample}`);
        });
      } else {
        console.log(`   📑 Columns: Unable to determine (table may be empty)`);
      }
      
      console.log('='.repeat(80));
    }
    
    // Summary
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Tables found: ${existingTables.length}`);
    console.log(`   📊 Total tables checked: ${KNOWN_TABLES.length}`);
    console.log(`   📭 Empty tables: ${existingTables.filter(t => tableStructures[t].rowCount === 0).length}`);
    console.log(`   📄 Tables with data: ${existingTables.filter(t => tableStructures[t].rowCount > 0).length}\n`);
    
    // Check for grxbooks schema
    console.log('🔍 Checking for grxbooks schema...\n');
    const grxbooksTables = KNOWN_TABLES.map(t => `grxbooks.${t}`);
    let grxbooksFound = 0;
    
    for (const table of grxbooksTables) {
      try {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (!error) {
          grxbooksFound++;
        }
      } catch (e) {
        // Table doesn't exist in grxbooks schema
      }
    }
    
    if (grxbooksFound > 0) {
      console.log(`   ✅ Found ${grxbooksFound} tables in grxbooks schema\n`);
    } else {
      console.log(`   📭 No tables found in grxbooks schema (schema may not exist yet)\n`);
    }
    
    console.log('✅ Database structure reading complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
