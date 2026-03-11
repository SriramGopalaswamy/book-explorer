import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://testdb_xiqm_user:gUBepdrwebxrfzzSfDQzT3GoHUZ0skc9@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm',
  ssl: { rejectUnauthorized: false }
});

const client = await pool.connect();

try {
  console.log('🔧 Fixing 2 problematic tables...\n');

  // Fix 1: organization_compliance (ARRAY → text[])
  console.log('1. Creating organization_compliance...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS grxbooks."organization_compliance" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "organization_id" uuid NOT NULL,
      "legal_name" text,
      "trade_name" text,
      "entity_type" text,
      "pan" text,
      "tan" text,
      "cin_or_llpin" text,
      "registered_address" text,
      "state" text,
      "pincode" text,
      "gstin" text[],
      "registration_type" text,
      "filing_frequency" text,
      "reverse_charge_applicable" boolean DEFAULT false,
      "einvoice_applicable" boolean DEFAULT false,
      "ewaybill_applicable" boolean DEFAULT false,
      "itc_eligible" boolean DEFAULT true,
      "financial_year_start" text,
      "books_start_date" date,
      "accounting_method" text DEFAULT 'accrual'::text,
      "base_currency" text DEFAULT 'INR'::text,
      "msme_status" boolean DEFAULT false,
      "industry_template" text,
      "coa_confirmed" boolean DEFAULT false,
      "phase1_completed_at" timestamp with time zone,
      "phase2_completed_at" timestamp with time zone,
      "logo_url" text,
      "brand_color" text,
      "authorized_signatory_name" text,
      "signature_url" text,
      "payroll_enabled" boolean DEFAULT false,
      "payroll_frequency" text,
      "pf_applicable" boolean DEFAULT false,
      "esi_applicable" boolean DEFAULT false,
      "professional_tax_applicable" boolean DEFAULT false,
      "gratuity_applicable" boolean DEFAULT false,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now(),
      PRIMARY KEY ("id")
    )
  `);
  console.log('   ✅ organization_compliance created\n');

  // Fix 2: sandbox_invite_links (remove extensions reference)
  console.log('2. Creating sandbox_invite_links...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS grxbooks."sandbox_invite_links" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "token" text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
      "sandbox_org_id" uuid NOT NULL,
      "created_by" uuid NOT NULL,
      "expires_at" timestamp with time zone,
      "is_active" boolean NOT NULL DEFAULT true,
      "label" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("id")
    )
  `);
  console.log('   ✅ sandbox_invite_links created\n');

  // Verify final count
  const result = await client.query(`
    SELECT COUNT(*) as count
    FROM information_schema.tables
    WHERE table_schema = 'grxbooks' AND table_type = 'BASE TABLE'
  `);

  console.log('✅ All done!');
  console.log(`   Total tables in grxbooks: ${result.rows[0].count}`);

} finally {
  client.release();
  await pool.end();
}
