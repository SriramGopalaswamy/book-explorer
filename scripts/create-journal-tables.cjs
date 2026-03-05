/**
 * Create Journal Tables and Profiles Safe View in grxbooks Schema
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

const createJournalTablesSQL = `
-- Set search path
SET search_path TO grxbooks, auth, public;

-- 1. Journal Entries table
CREATE TABLE IF NOT EXISTS grxbooks.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES grxbooks.organizations(id),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  source_type TEXT NOT NULL, -- 'invoice', 'bill', 'expense', 'payment', 'manual', 'reversal'
  source_id UUID, -- FK to the originating document
  is_reversal BOOLEAN NOT NULL DEFAULT false,
  reversed_entry_id UUID REFERENCES grxbooks.journal_entries(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, source_type, source_id)
);

-- 2. Journal Lines: Individual debit/credit legs
CREATE TABLE IF NOT EXISTS grxbooks.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES grxbooks.journal_entries(id) ON DELETE CASCADE,
  gl_account_id UUID NOT NULL REFERENCES grxbooks.gl_accounts(id),
  debit NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforce that exactly one of debit/credit is non-zero
  CONSTRAINT chk_debit_xor_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

-- 3. Profiles Safe View (public schema for compatibility)
CREATE OR REPLACE VIEW public.profiles_safe AS
  SELECT id, user_id, full_name, avatar_url, job_title, department, status, join_date, created_at, updated_at
  FROM grxbooks.profiles;

-- 4. Profiles Safe View (grxbooks schema)
CREATE OR REPLACE VIEW grxbooks.profiles_safe AS
  SELECT id, user_id, full_name, avatar_url, job_title, department, status, join_date, created_at, updated_at
  FROM grxbooks.profiles;

-- Indexes for journal tables
CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON grxbooks.journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON grxbooks.journal_entries(organization_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON grxbooks.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON grxbooks.journal_lines(gl_account_id);
`;

async function createJournalTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    console.log('🚀 Creating journal tables and views in grxbooks schema...\n');
    await client.query(createJournalTablesSQL);
    console.log('✅ Journal tables created successfully!\n');

    // Verify tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'grxbooks'
        AND table_name IN ('journal_entries', 'journal_lines')
      ORDER BY table_name;
    `);

    console.log('📊 Verified tables:');
    tablesResult.rows.forEach((row) => {
      console.log(`   ✅ grxbooks.${row.table_name}`);
    });

    // Verify views
    const viewsResult = await client.query(`
      SELECT table_name, table_schema
      FROM information_schema.views
      WHERE table_name = 'profiles_safe'
        AND table_schema IN ('grxbooks', 'public')
      ORDER BY table_schema, table_name;
    `);

    console.log('\n📊 Verified views:');
    viewsResult.rows.forEach((row) => {
      console.log(`   ✅ ${row.table_schema}.${row.table_name}`);
    });

    if (tablesResult.rows.length === 2 && viewsResult.rows.length >= 1) {
      console.log('\n✨ All journal tables and views created successfully!');
    } else {
      console.log(`\n⚠️  Expected 2 tables and 2 views, found ${tablesResult.rows.length} tables and ${viewsResult.rows.length} views`);
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

createJournalTables();
