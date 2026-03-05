import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env');
  process.exit(1);
}

async function setupVerificationFunction() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL database...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'create_verification_function.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('📝 Creating run_financial_verification function...');
    await client.query(sql);
    console.log('✅ Function created successfully!');

    // Test the function
    console.log('\n🧪 Testing the function...');
    const result = await client.query('SELECT grxbooks.run_financial_verification()');
    const verification = result.rows[0].run_financial_verification;

    console.log('\n✅ Verification function test results:');
    console.log('Engine Status:', verification.engine_status);
    console.log('Total Checks:', verification.total_checks);
    console.log('Run At:', verification.run_at);

    console.log('\n📊 Check Results:');
    verification.checks.forEach(check => {
      const statusIcon = check.status === 'PASS' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`${statusIcon} [${check.severity}] ${check.id}: ${check.detail}`);
    });

    console.log('\n✨ Setup complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupVerificationFunction();
