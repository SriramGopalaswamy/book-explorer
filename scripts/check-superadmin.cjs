const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSuperAdmin() {
  try {
    console.log('\n=== CHECKING SUPERADMIN SETUP ===\n');

    // Check if platform_roles table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'grxbooks'
        AND table_name = 'platform_roles'
      );
    `);

    console.log('1. Platform_roles table exists:', tableCheck.rows[0].exists);

    if (!tableCheck.rows[0].exists) {
      console.log('\n❌ ERROR: platform_roles table does not exist!');
      console.log('Creating platform_roles table...\n');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS grxbooks.platform_roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('super_admin')),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, role)
        );

        CREATE INDEX IF NOT EXISTS idx_platform_roles_user_id ON grxbooks.platform_roles(user_id);
        CREATE INDEX IF NOT EXISTS idx_platform_roles_role ON grxbooks.platform_roles(role);
      `);

      console.log('✅ Created platform_roles table\n');
    }

    // Check for existing super admins
    const superAdmins = await pool.query(`
      SELECT pr.*, u.email
      FROM grxbooks.platform_roles pr
      JOIN auth.users u ON pr.user_id = u.id
      WHERE pr.role = 'super_admin'
    `);

    console.log('2. Current super admins:', superAdmins.rows.length);
    if (superAdmins.rows.length > 0) {
      superAdmins.rows.forEach(admin => {
        console.log(`   - ${admin.email} (${admin.user_id})`);
      });
    }

    // Check the user from the logs (5bf92886-17fb-49f6-ad1b-1fec1cd5ddfa)
    const loggedInUser = await pool.query(`
      SELECT id, email FROM auth.users WHERE id = $1
    `, ['5bf92886-17fb-49f6-ad1b-1fec1cd5ddfa']);

    if (loggedInUser.rows.length > 0) {
      console.log('\n3. Logged in user:', loggedInUser.rows[0].email);

      const hasRole = await pool.query(`
        SELECT * FROM grxbooks.platform_roles WHERE user_id = $1
      `, ['5bf92886-17fb-49f6-ad1b-1fec1cd5ddfa']);

      if (hasRole.rows.length === 0) {
        console.log('   ❌ User does NOT have super_admin role in platform_roles!');
        console.log('   Adding super_admin role...');

        await pool.query(`
          INSERT INTO grxbooks.platform_roles (user_id, role, created_at)
          VALUES ($1, 'super_admin', NOW())
          ON CONFLICT (user_id, role) DO NOTHING
        `, ['5bf92886-17fb-49f6-ad1b-1fec1cd5ddfa']);

        console.log('   ✅ Added super_admin role');
      } else {
        console.log('   ✅ User has super_admin role');
      }
    }

    // List all @grx10.com users who should be super admins
    const grx10Users = await pool.query(`
      SELECT id, email FROM auth.users WHERE email LIKE '%@grx10.com'
    `);

    console.log('\n4. All @grx10.com users:', grx10Users.rows.length);

    const adminEmails = ['sriram@grx10.com', 'nikita@grx10.com', 'anchal@grx10.com', 'admin@grx10.com'];

    for (const user of grx10Users.rows) {
      if (adminEmails.includes(user.email.toLowerCase())) {
        console.log(`   - ${user.email} (should have super_admin)`);

        // Ensure they have super_admin role
        await pool.query(`
          INSERT INTO grxbooks.platform_roles (user_id, role, created_at)
          VALUES ($1, 'super_admin', NOW())
          ON CONFLICT (user_id, role) DO NOTHING
        `, [user.id]);
      } else {
        console.log(`   - ${user.email}`);
      }
    }

    // Final check
    const finalSuperAdmins = await pool.query(`
      SELECT pr.*, u.email
      FROM grxbooks.platform_roles pr
      JOIN auth.users u ON pr.user_id = u.id
      WHERE pr.role = 'super_admin'
    `);

    console.log('\n5. Super admins after fix:');
    finalSuperAdmins.rows.forEach(admin => {
      console.log(`   ✅ ${admin.email} (${admin.user_id})`);
    });

    console.log('\n✅ Superadmin setup complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkSuperAdmin();
