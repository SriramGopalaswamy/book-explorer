/**
 * Script to create essential tables in grxbooks schema if they don't exist
 * This ensures profiles and user_roles tables exist in grxbooks schema
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function setupGrxbooksTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Ensure grxbooks schema exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};`);
    console.log(`✅ Schema ${SCHEMA_NAME} exists`);

    // Create profiles table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.profiles (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
        full_name TEXT,
        email TEXT,
        department TEXT,
        job_title TEXT,
        phone TEXT,
        avatar_url TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'inactive')),
        join_date DATE DEFAULT CURRENT_DATE,
        manager_id UUID REFERENCES ${SCHEMA_NAME}.profiles(id),
        organization_id UUID,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.profiles created/verified`);

    // Create app_role enum if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ${SCHEMA_NAME}.app_role AS ENUM ('admin', 'hr', 'manager', 'employee');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log(`✅ Enum ${SCHEMA_NAME}.app_role created/verified`);

    // Create user_roles table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        role ${SCHEMA_NAME}.app_role NOT NULL,
        organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        UNIQUE (user_id, role, organization_id)
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.user_roles created/verified`);

    // Create organizations table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        settings JSONB DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'active',
        environment_type TEXT NOT NULL DEFAULT 'production' CHECK (environment_type IN ('production', 'sandbox')),
        org_state TEXT DEFAULT 'initializing',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.organizations created/verified`);

    // Create default organization if it doesn't exist
    await client.query(`
      INSERT INTO ${SCHEMA_NAME}.organizations (id, name, slug, org_state)
      VALUES ('00000000-0000-0000-0000-000000000001', 'GRX10 Solutions', 'grx10', 'active')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log(`✅ Default organization created/verified`);

    // Create organization_members table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.organization_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES ${SCHEMA_NAME}.organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(organization_id, user_id)
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.organization_members created/verified`);

    // Create subscriptions table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES ${SCHEMA_NAME}.organizations(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled')),
        source TEXT NOT NULL CHECK (source IN ('passkey','stripe')),
        valid_until TIMESTAMPTZ,
        is_read_only BOOLEAN NOT NULL DEFAULT false,
        enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['financial', 'hrms', 'performance', 'audit', 'assets'],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.subscriptions created/verified`);

    // Create default active subscription for the default organization
    await client.query(`
      INSERT INTO ${SCHEMA_NAME}.subscriptions (organization_id, plan, status, source, enabled_modules)
      VALUES ('00000000-0000-0000-0000-000000000001', 'enterprise', 'active', 'passkey', 
              ARRAY['financial', 'hrms', 'performance', 'audit', 'assets'])
      ON CONFLICT DO NOTHING;
    `);
    console.log(`✅ Default subscription created/verified`);

    // Create platform_roles table in grxbooks schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_NAME}.platform_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('super_admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, role)
      );
    `);
    console.log(`✅ Table ${SCHEMA_NAME}.platform_roles created/verified`);

    // Create index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${SCHEMA_NAME}_profiles_user_id ON ${SCHEMA_NAME}.profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_${SCHEMA_NAME}_profiles_email ON ${SCHEMA_NAME}.profiles(email);
      CREATE INDEX IF NOT EXISTS idx_${SCHEMA_NAME}_user_roles_user_id ON ${SCHEMA_NAME}.user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_${SCHEMA_NAME}_platform_roles_user_id ON ${SCHEMA_NAME}.platform_roles(user_id);
    `);
    console.log(`✅ Indexes created/verified`);

    console.log(`\n✅ All essential tables created in ${SCHEMA_NAME} schema!\n`);

    await client.end();
  } catch (error) {
    console.error('❌ Error setting up tables:', error);
    await client.end();
    process.exit(1);
  }
}

setupGrxbooksTables();
