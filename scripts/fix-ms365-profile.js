import { Client } from 'pg';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';

config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const targetUserId = '2acf5e0c-470b-462d-8c51-85cbd24d9a80';
const orgId = '00000000-0000-0000-0000-000000000001';

// Check existing profiles
console.log('Existing profiles:');
const existing = await client.query('SELECT id, user_id, full_name, email FROM grxbooks.profiles');
existing.rows.forEach(p => {
  console.log(`  ${p.full_name} - user_id: ${p.user_id}`);
});

// Check if profile exists for target user
const check = await client.query('SELECT * FROM grxbooks.profiles WHERE user_id = $1', [targetUserId]);

if (check.rows.length === 0) {
  console.log(`\n❌ No profile for user_id: ${targetUserId}`);
  console.log('Creating profile...');

  const profileId = randomUUID();
  await client.query(`
    INSERT INTO grxbooks.profiles (
      id, user_id, full_name, email, organization_id,
      status, join_date, working_week_policy, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
  `, [
    profileId,
    targetUserId,
    'Damodaran Shanmugam',
    'damo@grx10.com',
    orgId,
    'active',
    '2026-03-05',
    'default'
  ]);

  console.log('✅ Profile created successfully!');
  console.log(`   ID: ${profileId}`);
  console.log(`   User ID: ${targetUserId}`);
} else {
  console.log(`\n✅ Profile already exists for ${check.rows[0].full_name}`);
}

await client.end();
