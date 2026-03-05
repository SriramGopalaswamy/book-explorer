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

// Comprehensive list of tables from migrations
const KNOWN_TABLES = [
  // Auth & Profiles
  'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
  // Organizations
  'organizations', 'organization_members', 'organization_compliance', 'organization_integrations', 'organization_roles',
  // HR Module
  'employees', 'goals', 'memos', 'attendance', 'attendance_shifts', 'attendance_parse_diagnostics',
  'leave_balances', 'leave_requests', 'employee_tax_settings', 'investment_declarations',
  'master_ctc_components', 'payslip_disputes', 'profile_change_requests',
  // Payroll
  'payroll_records', 'payroll_components', 'payroll_bulk_uploads', 'payroll_bulk_upload_rows',
  // Financial Module
  'invoices', 'invoice_items', 'bank_accounts', 'bank_transactions', 'bank_transfer_batches',
  'scheduled_payments', 'chart_of_accounts', 'journal_entries', 'journal_entry_items',
  'vendors', 'bills', 'payments', 'credits', 'budgets', 'cost_centers',
  // Tax & Compliance
  'tax_regimes', 'tax_slabs', 'form16_records',
  // Audit & Logging
  'audit_logs', 'audit_compliance_runs', 'audit_compliance_checks', 'audit_risk_themes',
  'audit_ai_anomalies', 'audit_ai_samples', 'audit_ai_narratives', 'audit_pack_exports', 'audit_ifc_assessments',
  // Financial Integrity
  'control_account_overrides', 'period_close_logs', 'subledger_reconciliation_log',
  // Subscriptions
  'subscriptions', 'subscription_keys', 'subscription_redemptions',
  // Bulk Upload
  'attendance_bulk_uploads', 'attendance_bulk_upload_rows',
  'roles_bulk_uploads', 'roles_bulk_upload_rows',
];

async function getAllTables() {
  // Try to query information_schema via a custom function if available
  // Otherwise, use the known tables list
  const tables = [...KNOWN_TABLES];
  
  // Try to verify which tables actually exist by attempting to query them
  const existingTables = [];
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (!error || error.code !== 'PGRST116') { // PGRST116 = table not found
        existingTables.push(table);
      }
    } catch (e) {
      // Table might not exist, skip it
    }
  }
  
  return existingTables.length > 0 ? existingTables : tables;
}

async function getTableData(tableName) {
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .limit(100); // Limit to prevent huge outputs

    if (error) {
      // Check if it's a "table doesn't exist" error
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return { error: 'Table does not exist', data: null, count: 0 };
      }
      return { error: error.message, data: null, count: 0 };
    }

    return { data: data || [], error: null, count: count || data?.length || 0 };
  } catch (e) {
    return { error: e.message, data: null, count: 0 };
  }
}

async function main() {
  console.log('🔌 Connecting to Supabase...\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  try {
    // Get all tables
    console.log('🔍 Discovering tables...\n');
    const tables = await getAllTables();
    
    if (tables.length === 0) {
      console.log('❌ No tables found in the database.');
      return;
    }

    console.log(`📊 Found ${tables.length} tables\n`);
    console.log('='.repeat(100));

    let totalRows = 0;
    let tablesWithData = 0;
    let emptyTables = 0;
    let errorTables = 0;

    // For each table, get the data
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i];
      console.log(`\n[${i + 1}/${tables.length}] 📋 Table: ${tableName}`);
      console.log('-'.repeat(100));
      
      const { data, error, count } = await getTableData(tableName);
      
      if (error) {
        if (error.includes('does not exist')) {
          console.log(`   ⚠️  Table does not exist (skipping)`);
          continue;
        }
        console.log(`   ❌ Error: ${error}`);
        errorTables++;
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
    console.log(`   ❌ Error tables: ${errorTables}`);
    console.log(`   📊 Total rows across all tables: ${totalRows}`);
    console.log('\n✅ Database inspection complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

main();
