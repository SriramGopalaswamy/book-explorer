/**
 * Test the DO block approach for CREATE TYPE
 */

const fs = require('fs');
const path = require('path');

const testFile = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260206082407_d43841f6-2333-41d5-852d-5bb135db6ee9.sql');
const sql = fs.readFileSync(testFile, 'utf8');

console.log('Original CREATE TYPE:');
const original = sql.match(/CREATE\s+TYPE[^\n]+/i)?.[0];
console.log(original);
console.log();

// Test the DO block replacement
const adapted = sql.replace(/CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)\s+AS\s+ENUM\s*\(([^)]+)\)/gi, (match, ifNotExists, typeName, enumValues) => {
  return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'grxbooks')) THEN
    CREATE TYPE grxbooks.${typeName} AS ENUM (${enumValues});
  END IF;
END $$;`;
});

console.log('Adapted CREATE TYPE (DO block):');
const adaptedMatch = adapted.match(/DO\s+\$\$\s+BEGIN[\s\S]+?END\s+\$\$;/i)?.[0];
if (adaptedMatch) {
  console.log(adaptedMatch);
} else {
  console.log('NO MATCH - regex might be wrong');
  console.log('First 200 chars of adapted:');
  console.log(adapted.substring(0, 200));
}
