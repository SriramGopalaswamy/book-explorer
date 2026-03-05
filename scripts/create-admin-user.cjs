/**
 * Script to create an admin user for email/password authentication
 * Usage: node scripts/create-admin-user.cjs
 */

const path = require('path');
// Use backend-api dependencies
const backendApiPath = path.resolve(__dirname, '..', 'backend-api');
const { Client } = require(path.join(backendApiPath, 'node_modules', 'pg'));
const bcrypt = require(path.join(backendApiPath, 'node_modules', 'bcrypt'));
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_NAME = 'grxbooks';

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@grx10.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_FULL_NAME = 'Admin User';

async function createAdminUser() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Set search path
    await client.query(`SET search_path TO ${SCHEMA_NAME}, public, auth;`);

    // Check if user already exists
    const { rows: existingUsers } = await client.query(
      'SELECT id, email FROM auth.users WHERE email = $1',
      [ADMIN_EMAIL.toLowerCase()]
    );

    if (existingUsers.length > 0) {
      const userId = existingUsers[0].id;
      console.log(`⚠️  User ${ADMIN_EMAIL} already exists (ID: ${userId})`);
      
      // Update password
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await client.query(
        'UPDATE auth.users SET encrypted_password = $1, email_confirmed_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
      console.log('✅ Password updated');

      // Ensure profile exists
      const { rows: profiles } = await client.query(
        `SELECT id FROM ${SCHEMA_NAME}.profiles WHERE user_id = $1`,
        [userId]
      );

      if (profiles.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [userId, ADMIN_FULL_NAME, ADMIN_EMAIL.toLowerCase()]
        );
        console.log('✅ Profile created');
      } else {
        // Update profile
        await client.query(
          `UPDATE ${SCHEMA_NAME}.profiles SET full_name = $1, email = $2, updated_at = NOW() WHERE user_id = $3`,
          [ADMIN_FULL_NAME, ADMIN_EMAIL.toLowerCase(), userId]
        );
        console.log('✅ Profile updated');
      }

      // Ensure admin role exists
      const { rows: roles } = await client.query(
        `SELECT id FROM ${SCHEMA_NAME}.user_roles WHERE user_id = $1 AND role = 'admin'`,
        [userId]
      );

      if (roles.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA_NAME}.user_roles (user_id, role, created_at) VALUES ($1, 'admin', NOW()) ON CONFLICT DO NOTHING`,
          [userId]
        );
        console.log('✅ Admin role assigned');
      } else {
        console.log('✅ Admin role already assigned');
      }

      console.log(`\n✅ Admin user ready!`);
      console.log(`   Email: ${ADMIN_EMAIL}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      console.log(`   Role: admin\n`);

      await client.end();
      return;
    }

    // Create new user
    console.log(`Creating admin user: ${ADMIN_EMAIL}...`);

    // Hash password
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Create user in auth.users table
    const { rows: newUsers } = await client.query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
       VALUES ($1, $2, NOW(), NOW(), NOW(), $3)
       RETURNING id, email, created_at`,
      [ADMIN_EMAIL.toLowerCase(), hashedPassword, JSON.stringify({ full_name: ADMIN_FULL_NAME })]
    );

    const user = newUsers[0];
    console.log(`✅ User created (ID: ${user.id})`);

    // Create profile
    await client.query(
      `INSERT INTO ${SCHEMA_NAME}.profiles (user_id, full_name, email, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [user.id, ADMIN_FULL_NAME, ADMIN_EMAIL.toLowerCase()]
    );
    console.log('✅ Profile created');

    // Assign admin role
    await client.query(
      `INSERT INTO ${SCHEMA_NAME}.user_roles (user_id, role, created_at) VALUES ($1, 'admin', NOW())`,
      [user.id]
    );
    console.log('✅ Admin role assigned');

    console.log(`\n✅ Admin user created successfully!`);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Role: admin\n`);

    await client.end();
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    await client.end();
    process.exit(1);
  }
}

createAdminUser();
