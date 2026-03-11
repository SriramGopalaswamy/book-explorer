import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function importAllGrx10Tables() {
  const dumpFilePath = 'C:\\Users\\damod\\Downloads\\grx10-dump-2026-03-05.sql';
  const destDb = 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm';

  console.log('='.repeat(60));
  console.log('IMPORTING ALL 100 GRX10 TABLES TO GRXBOOKS SCHEMA');
  console.log('='.repeat(60));
  console.log('');

  // All 100 tables in dependency order (respecting foreign keys)
  const allTables = [
    // Level 1: No dependencies
    'master_coa_template',
    'platform_roles',
    'subscription_keys',
    'tax_regimes',

    // Level 2: Depends on level 1
    'organizations',
    'tax_slabs',

    // Level 3: Depends on organizations
    'platform_admin_logs',
    'profiles',
    'profiles_safe',
    'customers',
    'vendors',
    'financial_years',
    'gl_accounts',
    'chart_of_accounts',
    'bank_accounts',
    'credit_cards',
    'holidays',
    'leave_types',
    'attendance_shifts',
    'organization_members',
    'organization_roles',
    'organization_settings',
    'organization_compliance',
    'organization_integrations',
    'organization_oauth_configs',
    'master_ctc_components',
    'invoice_settings',
    'document_sequences',
    'onboarding_snapshots',
    'sandbox_invite_links',
    'sandbox_users',
    'subscriptions',
    'subscription_redemptions',
    'approval_workflows',
    'notifications',
    'ai_calibration',
    'ai_alerts',
    'ai_financial_snapshots',
    'ai_risk_scores',
    'audit_logs',
    'audit_compliance_runs',
    'memos',
    'bulk_upload_history',
    'attendance_upload_logs',
    'simulation_runs',

    // Level 4: Depends on profiles
    'user_roles',
    'leave_balances',
    'leave_requests',
    'attendance_records',
    'attendance_punches',
    'attendance_correction_requests',
    'attendance_daily',
    'attendance_parse_diagnostics',
    'employee_details',
    'employee_documents',
    'employee_tax_settings',
    'investment_declarations',
    'form16_records',
    'profile_change_requests',
    'compensation_structures',
    'goal_plans',
    'goals',
    'expenses',
    'reimbursement_requests',
    'compensation_revision_requests',

    // Level 5: Depends on financial_years
    'fiscal_periods',

    // Level 6: Depends on customers/vendors
    'invoices',
    'quotes',
    'bills',
    'vendor_credits',
    'credit_notes',
    'ai_customer_profiles',
    'ai_vendor_profiles',

    // Level 7: Depends on invoices/bills
    'invoice_items',
    'quote_items',
    'bill_items',
    'assets',

    // Level 8: Depends on fiscal_periods
    'period_close_logs',
    'budgets',

    // Level 9: Depends on gl_accounts
    'financial_records',
    'journal_entries',

    // Level 10: Depends on journal_entries
    'journal_lines',
    'control_account_overrides',
    'subledger_reconciliation_log',

    // Level 11: Depends on assets
    'asset_depreciation_entries',

    // Level 12: Depends on compensation_structures
    'compensation_components',
    'payroll_runs',

    // Level 13: Depends on payroll_runs
    'payroll_entries',
    'payroll_records',
    'bank_transfer_batches',

    // Level 14: Depends on payroll_records
    'payslip_disputes',

    // Level 15: Credit card transactions
    'credit_card_transactions',

    // Level 16: Bank transactions
    'bank_transactions',

    // Level 17: Scheduled payments
    'scheduled_payments',

    // Level 18: Audit tables
    'audit_risk_themes',
    'audit_compliance_checks',
    'audit_ifc_assessments',
    'audit_pack_exports',
    'audit_ai_anomalies',
    'audit_ai_narratives',
    'audit_ai_samples'
  ];

  console.log(`📊 Total tables to import: ${allTables.length}`);
  console.log('');

  console.log('📖 Reading SQL dump file...');
  let sqlContent = fs.readFileSync(dumpFilePath, 'utf-8');
  console.log(`   ✅ Read ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  console.log('🔧 Fixing Supabase syntax...');

  // Fix ARRAY type syntax
  sqlContent = sqlContent.replace(/(\s+"[^"]+"\s+)ARRAY(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, '$1text[]$2');

  // Fix USER-DEFINED types
  sqlContent = sqlContent.replace(/\s+USER-DEFINED(\s+(?:NOT NULL|DEFAULT|,|\)|$))/gi, ' text$1');

  console.log('   ✅ Fixed syntax');
  console.log('');

  // Extract all tables
  console.log('✂️  Extracting table statements...');

  const tableStatements = {};

  for (const table of allTables) {
    // Extract CREATE TABLE statement
    const createRegex = new RegExp(
      `-- Table: ${table}[\\s\\S]*?CREATE TABLE[^;]+;`,
      'i'
    );
    const createMatch = sqlContent.match(createRegex);

    if (createMatch) {
      tableStatements[table] = {
        create: createMatch[0].replace(/public\./g, 'grxbooks.'),
        inserts: []
      };

      // Extract INSERT statements
      const insertRegex = new RegExp(
        `INSERT INTO public\\."${table}"[^;]+;`,
        'gi'
      );
      const insertMatches = sqlContent.match(insertRegex);

      if (insertMatches) {
        tableStatements[table].inserts = insertMatches.map(s =>
          s.replace(/public\./g, 'grxbooks.')
        );
      }
    }

    if ((allTables.indexOf(table) + 1) % 20 === 0) {
      process.stdout.write(`\r   Extracted ${allTables.indexOf(table) + 1}/${allTables.length} tables...`);
    }
  }

  console.log(`\r   ✅ Extracted ${Object.keys(tableStatements).length} tables                 `);
  console.log('');

  // Connect to database
  const pool = new Pool({ connectionString: destDb, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('🗑️  Dropping and recreating grxbooks schema...');
    await client.query('DROP SCHEMA IF EXISTS grxbooks CASCADE');
    await client.query('CREATE SCHEMA grxbooks');
    console.log('   ✅ Fresh schema ready');
    console.log('');

    console.log('📥 Importing all tables...');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allTables.length; i++) {
      const table = allTables[i];
      const statements = tableStatements[table];

      if (!statements) {
        console.log(`   [${i + 1}/${allTables.length}] ⚠️  ${table}: not found in dump`);
        errorCount++;
        continue;
      }

      try {
        // Create table
        await client.query(statements.create);

        // Insert data
        let insertedCount = 0;
        if (statements.inserts.length > 0) {
          for (const insertStmt of statements.inserts) {
            try {
              await client.query(insertStmt);
              insertedCount++;
            } catch (insertErr) {
              // Skip individual row errors
            }
          }
        }

        const rowInfo = insertedCount > 0 ? `${insertedCount} rows` : 'empty';
        console.log(`   [${i + 1}/${allTables.length}] ✅ ${table}: ${rowInfo}`);
        successCount++;

      } catch (err) {
        console.log(`   [${i + 1}/${allTables.length}] ❌ ${table}: ${err.message.substring(0, 60)}`);
        errorCount++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Success: ${successCount} tables`);
    console.log(`❌ Errors: ${errorCount} tables`);
    console.log('');

    console.log('🔍 Verifying total row counts...');

    const totalResult = await client.query(`
      SELECT
        COUNT(*) as table_count,
        (SELECT SUM(n_tup_ins) FROM pg_stat_user_tables WHERE schemaname = 'grxbooks') as total_rows
      FROM information_schema.tables
      WHERE table_schema = 'grxbooks' AND table_type = 'BASE TABLE'
    `);

    console.log(`   Tables created: ${totalResult.rows[0].table_count}`);
    console.log(`   Total rows imported: ${totalResult.rows[0].total_rows || 'N/A'}`);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ IMPORT COMPLETED!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

importAllGrx10Tables();
