import { Client } from 'pg';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

const ORGANIZATIONS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'GRX10 Solutions',
    slug: 'grx10',
    status: 'active',
    environment_type: 'production',
    org_state: 'active'
  },
  {
    id: 'a792ea03-b379-491e-8a9e-bc46f7d32a86',
    name: 'test',
    slug: 'sandbox-a792ea03-b379-491e-8a9e-bc46f7d32a86',
    status: 'active',
    environment_type: 'sandbox',
    org_state: 'active'
  },
  {
    id: '90c06c96-bf23-4ca6-8984-c9f586534105',
    name: 'test 2',
    slug: 'sandbox-90c06c96-bf23-4ca6-8984-c9f586534105',
    status: 'active',
    environment_type: 'sandbox',
    org_state: 'active'
  }
];

async function setupTenants() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    console.log('📋 Creating 3 organizations...\n');

    for (const org of ORGANIZATIONS) {
      console.log(`⏳ Creating: ${org.name} (${org.slug})...`);

      try {
        // Check if organization exists
        const existing = await client.query(
          'SELECT id FROM grxbooks.organizations WHERE id = $1',
          [org.id]
        );

        if (existing.rows.length > 0) {
          console.log(`   ⚠️  Already exists, updating...\n`);
          await client.query(`
            UPDATE grxbooks.organizations
            SET name = $2, slug = $3, status = $4, environment_type = $5, org_state = $6, updated_at = NOW()
            WHERE id = $1
          `, [org.id, org.name, org.slug, org.status, org.environment_type, org.org_state]);
        } else {
          console.log(`   ✅ Creating new organization...\n`);
          await client.query(`
            INSERT INTO grxbooks.organizations (id, name, slug, settings, status, environment_type, org_state, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          `, [org.id, org.name, org.slug, {}, org.status, org.environment_type, org.org_state]);
        }

        // Create subscription for each org
        console.log(`   📦 Setting up subscription...`);
        const subExists = await client.query(
          'SELECT id FROM grxbooks.subscriptions WHERE organization_id = $1',
          [org.id]
        );

        if (subExists.rows.length === 0) {
          await client.query(`
            INSERT INTO grxbooks.subscriptions (organization_id, plan, status, source, is_read_only, enabled_modules)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            org.id,
            org.environment_type === 'production' ? 'enterprise' : 'professional',
            'active',
            'passkey',
            false,
            ['financial', 'hrms', 'performance', 'audit', 'assets']
          ]);
          console.log(`   ✅ Subscription created\n`);
        } else {
          console.log(`   ⚠️  Subscription already exists\n`);
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }

    // Show final organizations
    const result = await client.query(`
      SELECT id, name, slug, status, environment_type, org_state, created_at
      FROM grxbooks.organizations
      ORDER BY created_at;
    `);

    console.log('='.repeat(60));
    console.log('📊 Organizations in database:\n');
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.name}`);
      console.log(`   Slug: ${row.slug}`);
      console.log(`   Type: ${row.environment_type}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   ID: ${row.id}\n`);
    });
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupTenants();
