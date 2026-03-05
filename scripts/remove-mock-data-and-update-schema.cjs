const fs = require('fs');
const path = require('path');

const SCHEMA_NAME = 'grxbooks';
const HOOKS_DIR = path.join(__dirname, '..', 'src', 'hooks');
const PAGES_DIR = path.join(__dirname, '..', 'src', 'pages');

// Files that import mock data
const FILES_TO_UPDATE = [
  'src/hooks/useEmployees.ts',
  'src/hooks/useInvoices.ts',
  'src/hooks/useFinancialData.ts',
  'src/hooks/useGoals.ts',
  'src/hooks/useMemos.ts',
  'src/hooks/usePayroll.ts',
  'src/hooks/useAttendance.ts',
  'src/hooks/useLeaves.ts',
  'src/hooks/useBanking.ts',
  'src/hooks/useCashFlow.ts',
  'src/hooks/useManagerTeam.ts',
  'src/pages/hrms/OrgChart.tsx',
];

function removeMockDataImports(content) {
  // Remove mock data imports
  content = content.replace(/import\s+{[^}]*mock[^}]*}\s+from\s+["']@\/lib\/mock-data["'];?\n/g, '');
  content = content.replace(/import\s+\*\s+as\s+mock[^\n]*\n/g, '');
  
  return content;
}

function removeDevModeChecks(content) {
  // Remove isDevMode variable declarations
  content = content.replace(/const\s+isDevMode\s*=\s*useIsDevModeWithoutAuth\(\);\s*\n/g, '');
  
  // Remove isDevMode from query keys
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*isDevMode\]/g, 'queryKey: [$1]');
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*user\?\.id,\s*isDevMode\]/g, 'queryKey: [$1, user?.id]');
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*isDevMode,\s*([^\]]*)\]/g, 'queryKey: [$1, $2]');
  
  // Remove conditional returns with mock data
  content = content.replace(/if\s*\(isDevMode\)\s*return\s+mock[A-Za-z]+;\s*\n\s*/g, '');
  
  // Remove isDevMode from enabled conditions
  content = content.replace(/enabled:\s*\(!!user\s*&&\s*!isRoleLoading\)\s*\|\|\s*isDevMode/g, 'enabled: !!user && !isRoleLoading');
  content = content.replace(/enabled:\s*!!user\s*\|\|\s*isDevMode/g, 'enabled: !!user');
  content = content.replace(/enabled:\s*!!user\s*\|\|\s*isDevMode/g, 'enabled: !!user');
  
  // Remove useIsDevModeWithoutAuth import if not used elsewhere
  if (!content.includes('useIsDevModeWithoutAuth')) {
    content = content.replace(/import\s+{\s*useIsDevModeWithoutAuth\s*}\s+from\s+["']@\/hooks\/useDevModeData["'];?\n/g, '');
  }
  
  return content;
}

function updateSchemaReferences(content) {
  // Update table references to use grxbooks schema
  // Pattern: .from("table_name") -> .from("grxbooks.table_name")
  // But be careful not to break existing references
  
  // Common tables
  const tables = [
    'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
    'organizations', 'organization_members',
    'employees', 'goals', 'memos', 'attendance', 'attendance_shifts',
    'leave_balances', 'leave_requests',
    'invoices', 'invoice_items', 'bank_accounts', 'bank_transactions',
    'scheduled_payments', 'chart_of_accounts', 'journal_entries',
    'vendors', 'bills', 'payments', 'credits', 'budgets', 'cost_centers',
    'financial_records', 'customers', 'payroll_records',
  ];
  
  tables.forEach(table => {
    // Update .from("table_name") to .from("grxbooks.table_name")
    const regex = new RegExp(`\\.from\\(["']${table}["']\\)`, 'g');
    content = content.replace(regex, `.from("${SCHEMA_NAME}.${table}")`);
    
    // Update .from(`table_name`) to .from(`grxbooks.table_name`)
    const regex2 = new RegExp(`\\.from\\(\\\`${table}\\\`\\)`, 'g');
    content = content.replace(regex2, `.from(\`${SCHEMA_NAME}.${table}\`)`);
  });
  
  return content;
}

function processFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  
  // Apply transformations
  content = removeMockDataImports(content);
  content = removeDevModeChecks(content);
  content = updateSchemaReferences(content);
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No changes: ${filePath}`);
    return false;
  }
}

function main() {
  console.log('🔧 Removing Mock Data and Updating Schema References\n');
  console.log(`Schema: ${SCHEMA_NAME}\n`);
  console.log('='.repeat(80));
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  FILES_TO_UPDATE.forEach(file => {
    if (processFile(file)) {
      updatedCount++;
    } else {
      skippedCount++;
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updatedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files`);
  
  // Delete mock data file
  const mockDataFile = path.join(__dirname, '..', 'src', 'lib', 'mock-data.ts');
  if (fs.existsSync(mockDataFile)) {
    console.log(`\n🗑️  Deleting mock data file...`);
    fs.unlinkSync(mockDataFile);
    console.log(`   ✅ Deleted: src/lib/mock-data.ts`);
  }
  
  console.log('\n✅ Mock data removal complete!\n');
  console.log('📋 Next steps:');
  console.log('   1. Update Supabase client configuration to use test database');
  console.log('   2. Set up PostgREST or backend API for PostgreSQL connection');
  console.log('   3. Test the application\n');
}

main();
