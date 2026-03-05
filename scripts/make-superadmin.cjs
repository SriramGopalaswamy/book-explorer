/**
 * Script to make a user a super_admin
 * Usage: node scripts/make-superadmin.cjs <email>
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('❌ Usage: node scripts/make-superadmin.cjs <email>');
  console.error('   Example: node scripts/make-superadmin.cjs admin@grx10.com');
  process.exit(1);
}

async function makeSuperAdmin() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Set search path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, auth, public;`);

    // Find user by email
    const { rows: users } = await client.query(
      'SELECT id, email FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    const userId = users[0].id;
    console.log(`✅ Found user: ${email} (ID: ${userId})`);

    // Ensure platform_roles table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.platform_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('super_admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, role)
      );
    `);

    // Insert super_admin role
    await client.query(
      `INSERT INTO ${SCHEMA_NAME}.platform_roles (user_id, role, created_at)
       VALUES ($1, 'super_admin', NOW())
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );

    console.log(`✅ User ${email} is now a super_admin!`);
    console.log(`   They can now bypass subscription checks and access platform admin features.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

makeSuperAdmin();
