const { Client } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const userId = process.argv[2] || '5bf92886-17fb-49f6-ad1b-1fec1cd5ddfa';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkProfile() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    const { rows: profiles } = await client.query(
      'SELECT user_id, organization_id, full_name, email FROM grxbooks.profiles WHERE user_id = $1',
      [userId]
    );
    
    console.log('Profile data:', JSON.stringify(profiles, null, 2));
    
    if (profiles.length === 0) {
      console.log('\n❌ No profile found for user');
    } else if (!profiles[0].organization_id) {
      console.log('\n⚠️  Profile exists but organization_id is NULL');
      console.log('Setting default organization_id...');
      
      const defaultOrgId = '00000000-0000-0000-0000-000000000001';
      await client.query(
        'UPDATE grxbooks.profiles SET organization_id = $1 WHERE user_id = $2',
        [defaultOrgId, userId]
      );
      console.log('✅ Updated profile with organization_id');
    } else {
      console.log('\n✅ Profile has organization_id:', profiles[0].organization_id);
    }
    
    await client.end();
  } catch (error) {
    console.error('Error:', error);
    await client.end();
    process.exit(1);
  }
}

checkProfile();
