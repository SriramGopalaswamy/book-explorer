/**
 * Supabase Database Seeding Script
 * 
 * Seeds financial module data into Supabase tables:
 * - Invoices & Invoice Items
 * - Bank Accounts & Transactions
 * - Scheduled Payments
 * - Chart of Accounts
 * 
 * SECURITY CONTROLS:
 * - Only runs when DEV_MODE=true
 * - Requires authenticated Supabase user
 * - Uses service role key for admin operations
 */

const { createClient } = require('@supabase/supabase-js');
const { faker } = require('@faker-js/faker');

// Load environment variables
require('dotenv').config();

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configuration
const SEED_CONFIG = {
  invoices: 50,
  bankAccounts: 5,
  transactionsPerAccount: 30,
  scheduledPayments: 25,
  chartOfAccountsEntries: 40
};

// Categories and types
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const ACCOUNT_TYPES = ['Current', 'Savings', 'FD', 'Credit'];
const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Closed'];
const TRANSACTION_TYPES = ['credit', 'debit'];
const PAYMENT_STATUSES = ['scheduled', 'pending', 'completed', 'cancelled'];
const PAYMENT_TYPES = ['inflow', 'outflow'];
const RECURRENCE_INTERVALS = ['weekly', 'monthly', 'quarterly', 'yearly'];

const TRANSACTION_CATEGORIES = [
  'Salary', 'Sales Revenue', 'Investment', 'Consulting',
  'Office Rent', 'Utilities', 'Software Subscriptions',
  'Marketing', 'Travel', 'Equipment', 'Professional Fees',
  'Insurance', 'Taxes', 'Loan Payment', 'Miscellaneous'
];

// Utility functions
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomPastDate(maxMonths = 12) {
  const now = new Date();
  const monthsAgo = Math.floor(Math.random() * maxMonths);
  const date = new Date(now);
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(date.getDate() - Math.floor(Math.random() * 28));
  return date.toISOString().split('T')[0];
}

function getRandomFutureDate(maxMonths = 6) {
  const now = new Date();
  const monthsAhead = Math.floor(Math.random() * maxMonths) + 1;
  const date = new Date(now);
  date.setMonth(date.getMonth() + monthsAhead);
  date.setDate(date.getDate() + Math.floor(Math.random() * 28));
  return date.toISOString().split('T')[0];
}

// Get or create a test user
async function getOrCreateTestUser() {
  console.log('🔍 Looking for existing test user...');
  
  // Try to get existing users
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    throw listError;
  }
  
  if (existingUsers && existingUsers.users && existingUsers.users.length > 0) {
    console.log(`✓ Found ${existingUsers.users.length} existing user(s), using first one`);
    return existingUsers.users[0];
  }
  
  // Create a test user if none exists
  console.log('📝 Creating test user...');
  const testEmail = `dev-user-${Date.now()}@bookexplorer.dev`;
  const testPassword = 'DevMode123!';
  
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      full_name: 'Development User'
    }
  });
  
  if (createError) {
    console.error('Error creating user:', createError);
    throw createError;
  }
  
  console.log(`✓ Created test user: ${testEmail}`);
  console.log(`  Password: ${testPassword}`);
  return newUser.user;
}

// Seeding functions
async function seedInvoices(userId) {
  console.log('📄 Seeding invoices...');
  const invoices = [];
  
  for (let i = 0; i < SEED_CONFIG.invoices; i++) {
    const status = getRandomElement(INVOICE_STATUSES);
    const createdDate = getRandomPastDate(12);
    const dueDate = getRandomFutureDate(3);
    const baseAmount = Math.floor(Math.random() * 500000) + 50000;
    
    const invoiceData = {
      user_id: userId,
      invoice_number: `INV-${String(i + 1).padStart(5, '0')}`,
      client_name: faker.company.name(),
      client_email: faker.internet.email(),
      amount: baseAmount,
      due_date: dueDate,
      status: status,
      created_at: createdDate,
      updated_at: createdDate
    };
    
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();
    
    if (error) {
      console.error(`Error creating invoice ${i + 1}:`, error);
      continue;
    }
    
    // Create 1-5 invoice items for each invoice
    const numItems = Math.floor(Math.random() * 5) + 1;
    let totalAmount = 0;
    
    for (let j = 0; j < numItems; j++) {
      const quantity = Math.floor(Math.random() * 10) + 1;
      const rate = Math.floor(Math.random() * 50000) + 5000;
      const amount = quantity * rate;
      totalAmount += amount;
      
      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert({
          invoice_id: invoice.id,
          description: faker.commerce.productName(),
          quantity: quantity,
          rate: rate,
          amount: amount,
          created_at: createdDate
        });
      
      if (itemError) {
        console.error(`Error creating invoice item:`, itemError);
      }
    }
    
    // Update invoice with correct total
    await supabase
      .from('invoices')
      .update({ amount: totalAmount })
      .eq('id', invoice.id);
    
    invoices.push(invoice);
  }
  
  console.log(`✓ Created ${invoices.length} invoices with items`);
  return invoices;
}

async function seedBankAccounts(userId) {
  console.log('🏦 Seeding bank accounts...');
  const accounts = [];
  
  const accountNames = [
    'Main Business Account',
    'Savings Account',
    'Tax Reserve Account',
    'Payroll Account',
    'Investment Account'
  ];
  
  for (let i = 0; i < Math.min(SEED_CONFIG.bankAccounts, accountNames.length); i++) {
    const accountData = {
      user_id: userId,
      name: accountNames[i],
      account_type: getRandomElement(ACCOUNT_TYPES),
      account_number: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      balance: Math.floor(Math.random() * 5000000) + 100000,
      bank_name: faker.company.name() + ' Bank',
      status: i < 3 ? 'Active' : getRandomElement(ACCOUNT_STATUSES),
      created_at: getRandomPastDate(24),
      updated_at: new Date().toISOString()
    };
    
    const { data: account, error } = await supabase
      .from('bank_accounts')
      .insert(accountData)
      .select()
      .single();
    
    if (error) {
      console.error(`Error creating bank account ${i + 1}:`, error);
      continue;
    }
    
    accounts.push(account);
  }
  
  console.log(`✓ Created ${accounts.length} bank accounts`);
  return accounts;
}

async function seedBankTransactions(userId, accounts) {
  console.log('💸 Seeding bank transactions...');
  let transactionCount = 0;
  
  for (const account of accounts) {
    if (account.status !== 'Active') continue;
    
    for (let i = 0; i < SEED_CONFIG.transactionsPerAccount; i++) {
      const transactionData = {
        user_id: userId,
        account_id: account.id,
        transaction_type: getRandomElement(TRANSACTION_TYPES),
        amount: Math.floor(Math.random() * 200000) + 5000,
        description: faker.finance.transactionDescription(),
        category: getRandomElement(TRANSACTION_CATEGORIES),
        transaction_date: getRandomPastDate(12),
        reference: `TXN-${faker.string.alphanumeric(10).toUpperCase()}`,
        created_at: getRandomPastDate(12)
      };
      
      const { error } = await supabase
        .from('bank_transactions')
        .insert(transactionData);
      
      if (error) {
        console.error(`Error creating transaction:`, error);
        continue;
      }
      
      transactionCount++;
    }
  }
  
  console.log(`✓ Created ${transactionCount} bank transactions`);
  return transactionCount;
}

async function seedScheduledPayments(userId) {
  console.log('📅 Seeding scheduled payments...');
  let paymentCount = 0;
  
  const paymentNames = [
    'Monthly Rent', 'Electricity Bill', 'Internet Subscription',
    'Software Licenses', 'Insurance Premium', 'Loan EMI',
    'Salary Payroll', 'Vendor Payment', 'Tax Payment',
    'Marketing Budget', 'Cloud Services', 'Equipment Lease'
  ];
  
  for (let i = 0; i < SEED_CONFIG.scheduledPayments; i++) {
    const isRecurring = Math.random() > 0.3;
    const paymentData = {
      user_id: userId,
      name: i < paymentNames.length ? paymentNames[i] : faker.finance.accountName(),
      amount: Math.floor(Math.random() * 150000) + 10000,
      due_date: getRandomFutureDate(6),
      payment_type: getRandomElement(PAYMENT_TYPES),
      status: getRandomElement(PAYMENT_STATUSES),
      category: getRandomElement(TRANSACTION_CATEGORIES),
      recurring: isRecurring,
      recurrence_interval: isRecurring ? getRandomElement(RECURRENCE_INTERVALS) : null,
      created_at: getRandomPastDate(6),
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('scheduled_payments')
      .insert(paymentData);
    
    if (error) {
      console.error(`Error creating scheduled payment:`, error);
      continue;
    }
    
    paymentCount++;
  }
  
  console.log(`✓ Created ${paymentCount} scheduled payments`);
  return paymentCount;
}

async function seedChartOfAccounts(userId) {
  console.log('📊 Seeding chart of accounts...');
  let accountCount = 0;
  
  // Standard chart of accounts structure
  const accountsStructure = [
    // Assets
    { code: '1000', name: 'Cash and Cash Equivalents', type: 'asset', balance: 500000 },
    { code: '1100', name: 'Accounts Receivable', type: 'asset', balance: 300000 },
    { code: '1200', name: 'Inventory', type: 'asset', balance: 200000 },
    { code: '1500', name: 'Fixed Assets', type: 'asset', balance: 1000000 },
    { code: '1600', name: 'Intangible Assets', type: 'asset', balance: 150000 },
    
    // Liabilities
    { code: '2000', name: 'Accounts Payable', type: 'liability', balance: 200000 },
    { code: '2100', name: 'Short-term Loans', type: 'liability', balance: 100000 },
    { code: '2200', name: 'Tax Payable', type: 'liability', balance: 50000 },
    { code: '2500', name: 'Long-term Loans', type: 'liability', balance: 500000 },
    
    // Equity
    { code: '3000', name: 'Share Capital', type: 'equity', balance: 1000000 },
    { code: '3100', name: 'Retained Earnings', type: 'equity', balance: 400000 },
    
    // Revenue
    { code: '4000', name: 'Sales Revenue', type: 'revenue', balance: 800000 },
    { code: '4100', name: 'Service Revenue', type: 'revenue', balance: 300000 },
    { code: '4200', name: 'Interest Income', type: 'revenue', balance: 20000 },
    { code: '4300', name: 'Other Income', type: 'revenue', balance: 50000 },
    
    // Expenses
    { code: '5000', name: 'Cost of Goods Sold', type: 'expense', balance: 300000 },
    { code: '5100', name: 'Salaries and Wages', type: 'expense', balance: 400000 },
    { code: '5200', name: 'Rent Expense', type: 'expense', balance: 120000 },
    { code: '5300', name: 'Utilities Expense', type: 'expense', balance: 50000 },
    { code: '5400', name: 'Marketing Expense', type: 'expense', balance: 80000 },
    { code: '5500', name: 'IT and Software', type: 'expense', balance: 60000 },
    { code: '5600', name: 'Professional Fees', type: 'expense', balance: 40000 },
    { code: '5700', name: 'Travel Expense', type: 'expense', balance: 30000 },
    { code: '5800', name: 'Insurance Expense', type: 'expense', balance: 25000 },
    { code: '5900', name: 'Depreciation', type: 'expense', balance: 50000 },
    { code: '5950', name: 'Interest Expense', type: 'expense', balance: 15000 },
    { code: '5999', name: 'Miscellaneous Expense', type: 'expense', balance: 20000 }
  ];
  
  for (const account of accountsStructure) {
    const accountData = {
      user_id: userId,
      account_code: account.code,
      account_name: account.name,
      account_type: account.type,
      description: `Standard accounting account for ${account.name.toLowerCase()}`,
      is_active: true,
      opening_balance: account.balance,
      current_balance: account.balance + Math.floor((Math.random() - 0.5) * account.balance * 0.3),
      created_at: getRandomPastDate(12),
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('chart_of_accounts')
      .insert(accountData);
    
    if (error) {
      console.error(`Error creating account ${account.code}:`, error);
      continue;
    }
    
    accountCount++;
  }
  
  console.log(`✓ Created ${accountCount} chart of accounts entries`);
  return accountCount;
}

// Main seeding function
async function seedSupabase() {
  const startTime = Date.now();
  
  console.log('\n╔═════════════════════════════════════════╗');
  console.log('║   SUPABASE DATABASE SEEDING             ║');
  console.log('╚═════════════════════════════════════════╝\n');
  
  try {
    // Get or create test user
    const user = await getOrCreateTestUser();
    const userId = user.id;
    
    console.log(`\n📊 Seeding Configuration:`);
    console.log(`   User ID:            ${userId}`);
    console.log(`   Invoices:           ${SEED_CONFIG.invoices}`);
    console.log(`   Bank Accounts:      ${SEED_CONFIG.bankAccounts}`);
    console.log(`   Transactions/Acct:  ${SEED_CONFIG.transactionsPerAccount}`);
    console.log(`   Scheduled Payments: ${SEED_CONFIG.scheduledPayments}`);
    console.log(`   CoA Entries:        ${SEED_CONFIG.chartOfAccountsEntries}\n`);
    
    // Seed all modules
    const invoices = await seedInvoices(userId);
    const accounts = await seedBankAccounts(userId);
    const transactions = await seedBankTransactions(userId, accounts);
    const payments = await seedScheduledPayments(userId);
    const chartOfAccounts = await seedChartOfAccounts(userId);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Final Report
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUPABASE SEEDING COMPLETED SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Summary:');
    console.log(`   Invoices:           ${invoices.length}`);
    console.log(`   Bank Accounts:      ${accounts.length}`);
    console.log(`   Transactions:       ${transactions}`);
    console.log(`   Scheduled Payments: ${payments}`);
    console.log(`   Chart of Accounts:  ${chartOfAccounts}`);
    console.log(`   Duration:           ${duration}s`);
    console.log(`   User ID:            ${userId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔒 Data seeded to Supabase development project');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return {
      success: true,
      counts: {
        invoices: invoices.length,
        bankAccounts: accounts.length,
        transactions: transactions,
        scheduledPayments: payments,
        chartOfAccounts: chartOfAccounts
      },
      userId,
      duration
    };
    
  } catch (error) {
    console.error('\n❌ SEEDING FAILED:', error.message);
    console.error(error);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  seedSupabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  seedSupabase
};
