/**
 * Test what happens when we adapt a migration SQL
 */

const fs = require('fs');
const path = require('path');

function adaptSQLForSchema(sql, schemaName) {
  // Comprehensive SQL adaptation to move from public to grxbooks schema
  // Preserve auth.users, auth.schema, storage references
  
  let adapted = sql;
  
  // 1. Replace CREATE TYPE public. with CREATE TYPE schemaName.
  adapted = adapted.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TYPE $1${schemaName}.`);
  
  // 2. Replace CREATE TABLE public. with CREATE TABLE schemaName.
  adapted = adapted.replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?public\./gi, `CREATE TABLE $1${schemaName}.`);
  
  // 3. Replace ALTER TABLE public. with ALTER TABLE schemaName.
  adapted = adapted.replace(/ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `ALTER TABLE $1${schemaName}.`);
  
  // 4. Replace DROP TABLE public. with DROP TABLE schemaName.
  adapted = adapted.replace(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\./gi, `DROP TABLE IF EXISTS ${schemaName}.`);
  
  // 5. Replace CREATE INDEX ... ON public. with ON schemaName.
  adapted = adapted.replace(/ON\s+public\.([a-z_][a-z0-9_]*)/gi, `ON ${schemaName}.$1`);
  
  // 6. Replace CREATE FUNCTION public. with CREATE FUNCTION schemaName.
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
    // Don't replace if it's part of auth.users or storage
    if (match.includes('auth.') || match.includes('storage.')) return match;
    // Don't double-prefix
    if (match.includes(schemaName)) return match;
    return `${schemaName}.${tableName}`;
  });
  
  return adapted;
}

// Test with a sample migration
const sampleFile = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql');
const sql = fs.readFileSync(sampleFile, 'utf8');
const adapted = adaptSQLForSchema(sql, 'grxbooks');

console.log('Original SQL (first 500 chars):');
console.log('='.repeat(60));
console.log(sql.substring(0, 500));
console.log('\n\nAdapted SQL (first 500 chars):');
console.log('='.repeat(60));
console.log(adapted.substring(0, 500));
console.log('\n\nChecking for "CREATE TABLE" statements:');
const createTableMatches = adapted.match(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_.]*)/gi);
if (createTableMatches) {
  console.log('Found CREATE TABLE statements:');
  createTableMatches.forEach(match => console.log(`   ${match}`));
} else {
  console.log('   No CREATE TABLE statements found');
}
