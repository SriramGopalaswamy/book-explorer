/**
 * Test if the fix will work
 */

const fs = require('fs');
const path = require('path');

function adaptSQLForSchema(sql, schemaName) {
  let adapted = sql;
  
  // 1. Replace CREATE TYPE public. with CREATE TYPE IF NOT EXISTS schemaName.
  // IMPORTANT: Always add IF NOT EXISTS to prevent "already exists" errors
  adapted = adapted.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TYPE IF NOT EXISTS ${schemaName}.`);
  
  // 2. Replace CREATE TABLE public. with CREATE TABLE IF NOT EXISTS schemaName.
  adapted = adapted.replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TABLE IF NOT EXISTS ${schemaName}.`);
  
  // 3. Replace ALTER TABLE public. with ALTER TABLE schemaName.
  adapted = adapted.replace(/ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `ALTER TABLE ${schemaName}.`);
  
  // 4. Replace DROP TABLE public. with DROP TABLE schemaName.
  adapted = adapted.replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE IF EXISTS ${schemaName}.`);
  
  // 5. Replace CREATE INDEX ... ON public. with ON schemaName.
  adapted = adapted.replace(/ON\s+public\.([a-z_][a-z0-9_]*)/gi, `ON ${schemaName}.$1`);
  
  // 6. Replace CREATE FUNCTION public. with CREATE OR REPLACE FUNCTION schemaName.
  // CREATE OR REPLACE will handle "already exists" for functions
  adapted = adapted.replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\./gi, `CREATE OR REPLACE FUNCTION ${schemaName}.`);
  
  // 7. Replace SET search_path = public with SET search_path = schemaName
  adapted = adapted.replace(/SET\s+search_path\s*=\s*public/gi, `SET search_path = ${schemaName}`);
  adapted = adapted.replace(/SET\s+search_path\s+TO\s+public/gi, `SET search_path TO ${schemaName}`);
  
  // 8. Replace FROM public. with FROM schemaName. (but not FROM auth.users)
  adapted = adapted.replace(/\bFROM\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users' || tableName.startsWith('auth')) return match;
    return `FROM ${schemaName}.${tableName}`;
  });
  
  // 9. Replace INSERT INTO public. with INSERT INTO schemaName.
  adapted = adapted.replace(/INSERT\s+INTO\s+public\./gi, `INSERT INTO ${schemaName}.`);
  
  // 10. Replace UPDATE public. with UPDATE schemaName.
  adapted = adapted.replace(/UPDATE\s+public\./gi, `UPDATE ${schemaName}.`);
  
  // 11. Replace DELETE FROM public. with DELETE FROM schemaName.
  adapted = adapted.replace(/DELETE\s+FROM\s+public\./gi, `DELETE FROM ${schemaName}.`);
  
  // 12. Replace REFERENCES public. with REFERENCES schemaName. (but preserve auth.users)
  adapted = adapted.replace(/REFERENCES\s+public\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (tableName === 'users') return 'REFERENCES auth.users';
    return `REFERENCES ${schemaName}.${tableName}`;
  });
  
  // 13. Replace any remaining public. references (but preserve auth., storage., etc.)
  adapted = adapted.replace(/\bpublic\.([a-z_][a-z0-9_]*)/gi, (match, tableName) => {
    if (match.includes('auth.') || match.includes('storage.')) return match;
    if (match.includes(schemaName)) return match;
    return `${schemaName}.${tableName}`;
  });
  
  return adapted;
}

// Test with the problematic migration
const testFile = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql');
const originalSQL = fs.readFileSync(testFile, 'utf8');
const adaptedSQL = adaptSQLForSchema(originalSQL, 'grxbooks');

console.log('🔍 Testing the fix:\n');
console.log('Original CREATE TYPE statement:');
const originalType = originalSQL.match(/CREATE\s+TYPE[^\n]+/i)?.[0];
console.log(`   ${originalType}\n`);

console.log('Adapted CREATE TYPE statement:');
const adaptedType = adaptedSQL.match(/CREATE\s+TYPE[^\n]+/i)?.[0];
console.log(`   ${adaptedType}\n`);

// Check if IF NOT EXISTS is present
if (adaptedType && adaptedType.includes('IF NOT EXISTS')) {
  console.log('✅ FIX WILL WORK: IF NOT EXISTS is present in adapted SQL');
  console.log('   This will prevent "already exists" errors\n');
} else {
  console.log('❌ FIX WON\'T WORK: IF NOT EXISTS is missing');
  console.log('   Need to improve the adaptation\n');
}

// Check CREATE TABLE statements
console.log('Original CREATE TABLE statement:');
const originalTable = originalSQL.match(/CREATE\s+TABLE[^\n]+/i)?.[0];
console.log(`   ${originalTable}\n`);

console.log('Adapted CREATE TABLE statement:');
const adaptedTable = adaptedSQL.match(/CREATE\s+TABLE[^\n]+/i)?.[0];
console.log(`   ${adaptedTable}\n`);

if (adaptedTable && adaptedTable.includes('IF NOT EXISTS')) {
  console.log('✅ CREATE TABLE also has IF NOT EXISTS\n');
} else {
  console.log('⚠️  CREATE TABLE missing IF NOT EXISTS (might cause issues)\n');
}
