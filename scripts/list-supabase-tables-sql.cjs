const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getTablesFromSchema() {
  // Use a direct SQL query approach via REST API
  // Supabase allows querying information_schema through the REST API
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_tables`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  }).catch(() => null);

  if (response && response.ok) {
    const data = await response.json();
    return data;
  }

  // Fallback: Try to query a known system table or use direct table access
  // We'll query each potential table and see which ones exist
  return null;
}

async function getTableData(tableName) {
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .limit(100);

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return { exists: false, error: null, data: null, count: 0 };
      }
      return { exists: true, error: error.message, data: null, count: 0 };
    }

    return { exists: true, data: data || [], error: null, count: count || data?.length || 0 };
  } catch (e) {
    return { exists: false, error: e.message, data: null, count: 0 };
  }
}

// Common table patterns to try
const TABLE_PATTERNS = [
  // Core tables
  'profiles', 'users', 'auth.users',
  // RBAC
  'roles', 'permissions', 'role_permissions', 'user_roles',
  // Organizations
  'organizations', 'organization_members', 'organization_compliance', 'organization_integrations', 'organization_roles',
  // HR
  'employees', 'goals', 'memos', 'attendance', 'attendance_shifts', 'leave_balances', 'leave_requests',
  'employee_tax_settings', 'investment_declarations', 'master_ctc_components', 'payslip_disputes',
  'profile_change_requests', 'payroll_records', 'payroll_components',
  // Financial
  'invoices', 'invoice_items', 'bank_accounts', 'bank_transactions', 'bank_transfer_batches',
  'scheduled_payments', 'chart_of_accounts', 'journal_entries', 'journal_entry_items',
  'vendors', 'bills', 'payments', 'credits', 'budgets', 'cost_centers',
  // Tax
  'tax_regimes', 'tax_slabs', 'form16_records',
  // Audit
  'audit_logs', 'audit_compliance_runs', 'audit_compliance_checks', 'audit_risk_themes',
  'audit_ai_anomalies', 'audit_ai_samples', 'audit_ai_narratives', 'audit_pack_exports', 'audit_ifc_assessments',
  // Financial integrity
  'control_account_overrides', 'period_close_logs', 'subledger_reconciliation_log',
  // Subscriptions
  'subscriptions', 'subscription_keys', 'subscription_redemptions',
  // Bulk uploads
  'payroll_bulk_uploads', 'payroll_bulk_upload_rows',
  'attendance_bulk_uploads', 'attendance_bulk_upload_rows',
  'roles_bulk_uploads', 'roles_bulk_upload_rows',
];

async function discoverTables() {
  const existingTables = [];
  
  console.log('🔍 Discovering existing tables...\n');
  
  for (const table of TABLE_PATTERNS) {
    const result = await getTableData(table);
    if (result.exists) {
      existingTables.push(table);
    }
  }
  
  return existingTables;
}

async function main() {
  console.log('🔌 Connecting to Supabase...\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  try {
    // Discover tables
    const tables = await discoverTables();
    
    if (tables.length === 0) {
      console.log('❌ No accessible tables found in the database.');
      console.log('💡 This might be due to:');
      console.log('   1. Database is empty (no tables created yet)');
      console.log('   2. RLS policies preventing access');
      console.log('   3. Need service role key for full access');
      return;
    }

    console.log(`\n📊 Found ${tables.length} accessible tables\n`);
    console.log('='.repeat(100));

    let totalRows = 0;
    let tablesWithData = 0;
    let emptyTables = 0;

    // For each table, get the data
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i];
      console.log(`\n[${i + 1}/${tables.length}] 📋 Table: ${tableName}`);
      console.log('-'.repeat(100));
      
      const { data, error, count } = await getTableData(tableName);
      
      if (error) {
        console.log(`   ❌ Error: ${error}`);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`   📭 Empty table (0 rows)`);
        emptyTables++;
        continue;
      }

      tablesWithData++;
      totalRows += count;
      console.log(`   📊 Total rows: ${count}`);
      console.log(`   📄 Showing: ${Math.min(data.length, 5)} ${data.length < count ? `(of ${count})` : 'rows'}`);
      
      // Display data in a readable format
      if (data.length > 0) {
        // Show column names
        const columns = Object.keys(data[0]);
        console.log(`   📑 Columns (${columns.length}): ${columns.slice(0, 10).join(', ')}${columns.length > 10 ? '...' : ''}`);
        console.log('');
        
        // Show first 5 rows as sample
        const displayRows = data.slice(0, 5);
        displayRows.forEach((row, index) => {
          console.log(`   ┌─ Row ${index + 1} ──────────────────────────────────────────────────────────────`);
          columns.slice(0, 8).forEach(col => {
            const value = row[col];
            let displayValue;
            if (value === null) {
              displayValue = 'NULL';
            } else if (value === undefined) {
              displayValue = 'undefined';
            } else if (typeof value === 'object') {
              displayValue = JSON.stringify(value).substring(0, 80);
            } else {
              displayValue = String(value).substring(0, 80);
            }
            console.log(`   │ ${col.padEnd(25)}: ${displayValue}`);
          });
          if (columns.length > 8) {
            console.log(`   │ ... and ${columns.length - 8} more columns`);
          }
          console.log(`   └────────────────────────────────────────────────────────────────────────────`);
        });
        
        if (data.length > 5) {
          console.log(`   ... and ${data.length - 5} more rows (showing first 5 only)`);
        }
        if (count > data.length) {
          console.log(`   ... and ${count - data.length} more rows in database (limited query)`);
        }
      }
      
      console.log('='.repeat(100));
    }

    console.log('\n📈 Summary:');
    console.log(`   ✅ Tables with data: ${tablesWithData}`);
    console.log(`   📭 Empty tables: ${emptyTables}`);
    console.log(`   📊 Total rows across all tables: ${totalRows}`);
    console.log('\n✅ Database inspection complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
