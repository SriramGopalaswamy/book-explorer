const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', 'src', 'hooks');

const FILES_TO_FIX = [
  'src/hooks/useFinancialData.ts',
  'src/hooks/useGoals.ts',
  'src/hooks/useMemos.ts',
  'src/hooks/usePayroll.ts',
  'src/hooks/useAttendance.ts',
  'src/hooks/useLeaves.ts',
  'src/hooks/useBanking.ts',
  'src/hooks/useCashFlow.ts',
  'src/hooks/useManagerTeam.ts',
];

function fixFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  
  // Remove mock data imports
  content = content.replace(/import\s+{[^}]*mock[^}]*}\s+from\s+["']@\/lib\/mock-data["'];?\n/g, '');
  
  // Remove useIsDevModeWithoutAuth import if not used elsewhere
  if (!content.match(/useIsDevModeWithoutAuth\(\)/)) {
    content = content.replace(/import\s+{\s*useIsDevModeWithoutAuth\s*}\s+from\s+["']@\/hooks\/useDevModeData["'];?\n/g, '');
  }
  
  // Remove isDevMode variable declarations
  content = content.replace(/const\s+isDevMode\s*=\s*useIsDevModeWithoutAuth\(\);\s*\n/g, '');
  
  // Remove isDevMode from query keys
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*isDevMode\]/g, 'queryKey: [$1]');
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*user\?\.id,\s*isDevMode\]/g, 'queryKey: [$1, user?.id]');
  content = content.replace(/queryKey:\s*\[([^\]]*),\s*isDevMode,\s*([^\]]*)\]/g, 'queryKey: [$1, $2]');
  
  // Remove conditional returns with mock data
  content = content.replace(/if\s*\(isDevMode\)\s*return\s+mock[A-Za-z]+;\s*\n\s*/g, '');
  content = content.replace(/if\s*\(isDevMode\)\s*{\s*\n\s*return\s+mock[A-Za-z]+[^}]*}\s*\n\s*/g, '');
  content = content.replace(/if\s*\(isDevMode\)\s*return\s+{[^}]*};\s*\n\s*/g, '');
  
  // Remove isDevMode from enabled conditions
  content = content.replace(/enabled:\s*\(!!user\s*&&\s*!isRoleLoading\)\s*\|\|\s*isDevMode/g, 'enabled: !!user && !isRoleLoading');
  content = content.replace(/enabled:\s*!!user\s*\|\|\s*isDevMode/g, 'enabled: !!user');
  content = content.replace(/enabled:\s*\(!!user\s*\|\|\s*isDevMode\)\s*&&\s*([^)]+)/g, 'enabled: !!user && $1');
  content = content.replace(/enabled:\s*!!user\s*&&\s*!isDevMode/g, 'enabled: !!user');
  
  // Remove isDevMode from if conditions
  content = content.replace(/if\s*\(isDevMode\s*\|\|\s*!user\)/g, 'if (!user)');
  content = content.replace(/if\s*\(!user\s*&&\s*!isDevMode\)/g, 'if (!user)');
  content = content.replace(/if\s*\(isDevMode\s*&&\s*([^)]+)\)/g, 'if ($1)');
  content = content.replace(/if\s*\(isDevMode\)/g, 'if (false)'); // Keep structure but disable
  
  // Update table references to use grxbooks schema (if not already)
  const tables = [
    'financial_records', 'goals', 'memos', 'payroll_records', 'attendance',
    'attendance_shifts', 'leave_requests', 'leave_balances', 'holidays',
    'bank_accounts', 'bank_transactions', 'scheduled_payments',
    'profiles', 'user_roles'
  ];
  
  tables.forEach(table => {
    // Only add schema if not already present
    const regex = new RegExp(`\\.from\\(["']${table}["']\\)`, 'g');
    if (!content.includes(`grxbooks.${table}`)) {
      content = content.replace(regex, `.from("grxbooks.${table}")`);
    }
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No changes: ${filePath}`);
    return false;
  }
}

function main() {
  console.log('🔧 Fixing Remaining Mock Data References\n');
  console.log('='.repeat(80));
  
  let fixedCount = 0;
  let skippedCount = 0;
  
  FILES_TO_FIX.forEach(file => {
    if (fixFile(file)) {
      fixedCount++;
    } else {
      skippedCount++;
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files`);
  console.log('\n✅ Mock data removal complete!\n');
}

main();
