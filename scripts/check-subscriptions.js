import { Client } from 'pg';
import { config } from 'dotenv';

config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const result = await client.query(`
  SELECT
    o.id as org_id,
    o.name as org_name,
    o.slug,
    o.environment_type,
    s.id as subscription_id,
    s.plan,
    s.status,
    s.source,
    s.valid_until,
    s.enabled_modules,
    s.is_read_only,
    s.created_at as sub_created_at
  FROM grxbooks.organizations o
  LEFT JOIN grxbooks.subscriptions s ON s.organization_id = o.id
  ORDER BY o.created_at;
`);

console.log('📊 Subscription Status:\n');
result.rows.forEach((row, idx) => {
  console.log(`${idx + 1}. ${row.org_name} (${row.slug})`);
  console.log(`   Organization ID: ${row.org_id}`);
  console.log(`   Subscription ID: ${row.subscription_id || 'NONE'}`);
  console.log(`   Plan: ${row.plan || 'NONE'}`);
  console.log(`   Status: ${row.status || 'NONE'}`);
  console.log(`   Source: ${row.source || 'NONE'}`);
  console.log(`   Valid Until: ${row.valid_until || 'Never (unlimited)'}`);
  console.log(`   Read Only: ${row.is_read_only !== null ? row.is_read_only : 'N/A'}`);
  console.log(`   Modules: ${row.enabled_modules ? row.enabled_modules.join(', ') : 'NONE'}\n`);
});

await client.end();
