const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

async function setupAuthTable() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Set search path to grxbooks
    await client.query(`SET search_path TO ${SCHEMA_NAME}, public;`);

    // Create auth schema within grxbooks (as a separate schema)
    await client.query(`CREATE SCHEMA IF NOT EXISTS auth;`);
    console.log('✅ Created auth schema');

    // Create auth.users table (matching Supabase structure)
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        encrypted_password TEXT NOT NULL,
        email_confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('✅ Created auth.users table');

    // Create index on email
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_users_email 
      ON auth.users(email);
    `);
    console.log('✅ Created email index');

    // Grant permissions
    await client.query(`GRANT ALL ON SCHEMA auth TO PUBLIC;`);
    await client.query(`GRANT ALL ON auth.users TO PUBLIC;`);
    console.log('✅ Granted permissions');

    console.log('\n✅ Auth table setup complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

setupAuthTable().catch(console.error);
