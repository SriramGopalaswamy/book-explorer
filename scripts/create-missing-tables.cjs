/**
 * Create Missing Tables in grxbooks Schema
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

const createTablesSQL = `
-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS grxbooks;

-- Set search path
SET search_path TO grxbooks, auth, public;

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS grxbooks.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON grxbooks.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON grxbooks.notifications(read);

-- 2. GL Accounts table
CREATE TABLE IF NOT EXISTS grxbooks.gl_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_account_id UUID REFERENCES grxbooks.gl_accounts(id),
  balance DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_org ON grxbooks.gl_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_gl_accounts_type ON grxbooks.gl_accounts(account_type);

-- 3. Financial Records table
CREATE TABLE IF NOT EXISTS grxbooks.financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  record_date DATE NOT NULL,
  record_type TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  account_id UUID REFERENCES grxbooks.gl_accounts(id),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_records_org ON grxbooks.financial_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_date ON grxbooks.financial_records(record_date);

-- 4. AI Financial Snapshots table
CREATE TABLE IF NOT EXISTS grxbooks.ai_financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  net_profit DECIMAL(15,2) DEFAULT 0,
  cash_balance DECIMAL(15,2) DEFAULT 0,
  insights JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_snapshots_org ON grxbooks.ai_financial_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_snapshots_date ON grxbooks.ai_financial_snapshots(snapshot_date);

-- 5. AI Risk Scores table
CREATE TABLE IF NOT EXISTS grxbooks.ai_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  score_date DATE NOT NULL,
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  liquidity_score INTEGER CHECK (liquidity_score BETWEEN 0 AND 100),
  profitability_score INTEGER CHECK (profitability_score BETWEEN 0 AND 100),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_risk_scores_org ON grxbooks.ai_risk_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_risk_scores_date ON grxbooks.ai_risk_scores(score_date);
`;

async function createTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    console.log('🚀 Creating missing tables in grxbooks schema...\n');
    await client.query(createTablesSQL);
    console.log('✅ Tables created successfully!\n');

    // Verify tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'grxbooks'
        AND table_name IN ('notifications', 'gl_accounts', 'financial_records', 'ai_financial_snapshots', 'ai_risk_scores')
      ORDER BY table_name;
    `);

    console.log('📊 Verified tables:');
    result.rows.forEach((row) => {
      console.log(`   ✅ grxbooks.${row.table_name}`);
    });

    if (result.rows.length === 5) {
      console.log('\n✨ All 5 tables created successfully!');
    } else {
      console.log(`\n⚠️  Only ${result.rows.length}/5 tables found`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTables();
