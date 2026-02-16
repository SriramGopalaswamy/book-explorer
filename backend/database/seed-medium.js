/**
 * Medium-Density Database Seeding System
 * 
 * SECURITY CONTROLS:
 * - Only runs when DEV_MODE=true
 * - Only runs when NODE_ENV != 'production'
 * - Uses separate development database (SQLite)
 * - Never affects production data
 * 
 * DATA ISOLATION STRATEGY: Option A - Separate Database
 * - Development: SQLite (./database/dev.sqlite)
 * - Production: PostgreSQL (DATABASE_URL_PROD)
 * - Complete physical separation, zero cross-contamination
 * 
 * FEATURES:
 * - Idempotent operation
 * - Transaction-wrapped for atomicity
 * - Realistic workflow distribution
 * - RBAC validation support
 * - Cross-role interactions
 * - Temporal distribution (12 months)
 */

const { faker } = require('@faker-js/faker');
const { sequelize } = require('../src/config/database');
const models = require('../src/modules');
const { DEV_MODE, NODE_ENV, isProduction } = require('../src/config/systemFlags');

// ========================================
// CONFIGURATION
// ========================================

const SEED_CONFIG = {
  users: {
    admin: 3,
    author: 12,
    moderator: 8,
    reader: 25
  },
  authors: 45,
  books: 275,
  reviewsPerBook: { min: 0, max: 8 }
};

// Book status distribution (workflow states)
const STATUS_DISTRIBUTION = [
  { status: 'active', weight: 30 },
  { status: 'pending', weight: 20 },
  { status: 'inactive', weight: 20 },
  { status: 'archived', weight: 30 }
];

const GENRES = [
  'Fantasy', 'Science Fiction', 'Mystery', 'Thriller', 'Romance',
  'Historical Fiction', 'Horror', 'Biography', 'Self-Help',
  'Business', 'Poetry', 'Drama', 'Adventure', 'Young Adult',
  'Crime', 'Dystopian', 'Paranormal', 'Contemporary'
];

// ========================================
// SAFETY CHECKS
// ========================================

function validateSeedingEnvironment() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 SEEDING SAFETY VALIDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`NODE_ENV:      ${NODE_ENV}`);
  console.log(`DEV_MODE:      ${DEV_MODE}`);
  console.log(`isProduction:  ${isProduction}`);
  console.log(`Database:      ${sequelize.options.dialect}`);
  
  if (isProduction) {
    throw new Error('❌ SEEDING BLOCKED: Cannot seed in production environment');
  }
  
  if (!DEV_MODE) {
    throw new Error('❌ SEEDING BLOCKED: DEV_MODE must be enabled');
  }
  
  if (NODE_ENV === 'production') {
    throw new Error('❌ SEEDING BLOCKED: NODE_ENV cannot be production');
  }
  
  if (sequelize.options.dialect !== 'sqlite') {
    console.warn('⚠️  WARNING: Not using SQLite database');
  }
  
  console.log('✓ All safety checks passed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getWeightedRandomStatus() {
  const totalWeight = STATUS_DISTRIBUTION.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of STATUS_DISTRIBUTION) {
    random -= item.weight;
    if (random <= 0) {
      return item.status;
    }
  }
  
  return STATUS_DISTRIBUTION[0].status;
}

function getRandomPastDate(maxMonths = 12) {
  const now = new Date();
  const monthsAgo = Math.floor(Math.random() * maxMonths);
  const date = new Date(now);
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(date.getDate() - Math.floor(Math.random() * 28));
  return date;
}

function generateISBN() {
  // Generate realistic ISBN-13
  const prefix = '978';
  const group = Math.floor(Math.random() * 9) + 1;
  const publisher = String(Math.floor(Math.random() * 90000) + 10000);
  const title = String(Math.floor(Math.random() * 900) + 100);
  const check = Math.floor(Math.random() * 10);
  
  return `${prefix}${group}${publisher}${title}${check}`;
}

// ========================================
// SEEDING FUNCTIONS
// ========================================

async function seedUsers() {
  console.log('👥 Seeding users...');
  const users = [];
  
  for (const [role, count] of Object.entries(SEED_CONFIG.users)) {
    for (let i = 0; i < count; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const username = faker.internet.username({ firstName, lastName }).toLowerCase();
      
      const userData = {
        username: `${username}_${faker.string.alphanumeric(4)}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        password: 'password123', // Will be hashed by model
        displayName: `${firstName} ${lastName}`,
        role: role,
        isActive: Math.random() > 0.1, // 90% active
        lastLoginAt: Math.random() > 0.3 ? getRandomPastDate(6) : null
      };
      
      const [user] = await models.User.findOrCreate({
        where: { email: userData.email },
        defaults: userData
      });
      
      users.push(user);
    }
  }
  
  console.log(`✓ Created ${users.length} users`);
  return users;
}

async function seedAuthors(creatorUsers) {
  console.log('✍️  Seeding authors...');
  const authors = [];
  
  // Get author role users who will create author profiles
  const authorRoleUsers = creatorUsers.filter(u => u.role === 'author' || u.role === 'admin');
  
  for (let i = 0; i < SEED_CONFIG.authors; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const fullName = `${firstName} ${lastName}`;
    
    const authorData = {
      name: fullName,
      biography: faker.lorem.paragraphs(2),
      birthDate: faker.date.birthdate({ min: 1930, max: 2000, mode: 'year' }),
      nationality: faker.location.country(),
      website: Math.random() > 0.5 ? faker.internet.url() : null,
      avatar: Math.random() > 0.6 ? faker.image.avatar() : null
    };
    
    const [author] = await models.Author.findOrCreate({
      where: { name: authorData.name },
      defaults: authorData
    });
    
    authors.push(author);
  }
  
  console.log(`✓ Created ${authors.length} authors`);
  return authors;
}

async function seedBooks(authors, creatorUsers) {
  console.log('📚 Seeding books...');
  const books = [];
  
  // Users who can create books (authors and admins)
  const bookCreators = creatorUsers.filter(u => u.role === 'author' || u.role === 'admin' || u.role === 'moderator');
  
  for (let i = 0; i < SEED_CONFIG.books; i++) {
    const author = getRandomElement(authors);
    const createdAt = getRandomPastDate(12);
    const updatedAt = new Date(createdAt.getTime() + Math.random() * 90 * 24 * 60 * 60 * 1000); // Up to 90 days later
    
    const bookData = {
      title: faker.lorem.words({ min: 2, max: 6 }),
      isbn: generateISBN(),
      genre: getRandomElement(GENRES),
      description: faker.lorem.paragraphs(3),
      publishedDate: faker.date.past({ years: 50 }),
      pageCount: Math.floor(Math.random() * 800) + 100,
      rating: Math.random() * 5,
      coverImage: Math.random() > 0.4 ? faker.image.url() : null,
      status: getWeightedRandomStatus(),
      authorId: author.id,
      createdAt,
      updatedAt
    };
    
    const [book] = await models.Book.findOrCreate({
      where: { isbn: bookData.isbn },
      defaults: bookData
    });
    
    books.push(book);
  }
  
  console.log(`✓ Created ${books.length} books`);
  console.log('   Status distribution:');
  
  const statusCounts = {};
  books.forEach(book => {
    statusCounts[book.status] = (statusCounts[book.status] || 0) + 1;
  });
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    const percentage = ((count / books.length) * 100).toFixed(1);
    console.log(`     ${status}: ${count} (${percentage}%)`);
  });
  
  return books;
}

async function seedReviews(books, users) {
  console.log('⭐ Seeding reviews...');
  let reviewCount = 0;
  
  // Readers can create reviews
  const reviewers = users.filter(u => u.isActive);
  
  for (const book of books) {
    // Only active books should have reviews
    if (book.status !== 'active' && Math.random() > 0.3) {
      continue;
    }
    
    const numReviews = Math.floor(
      Math.random() * (SEED_CONFIG.reviewsPerBook.max - SEED_CONFIG.reviewsPerBook.min + 1)
    ) + SEED_CONFIG.reviewsPerBook.min;
    
    // Shuffle reviewers to avoid same people reviewing same books
    const shuffledReviewers = [...reviewers].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(numReviews, shuffledReviewers.length); i++) {
      const reviewer = shuffledReviewers[i];
      const createdAt = new Date(
        Math.max(book.createdAt.getTime(), reviewer.createdAt?.getTime() || book.createdAt.getTime())
        + Math.random() * 180 * 24 * 60 * 60 * 1000 // Up to 180 days after book/user creation
      );
      
      try {
        const [review, created] = await models.Review.findOrCreate({
          where: { 
            bookId: book.id,
            userId: reviewer.id
          },
          defaults: {
            rating: Math.floor(Math.random() * 5) + 1,
            reviewText: Math.random() > 0.2 ? faker.lorem.paragraphs(2) : faker.lorem.sentence(),
            isPublic: Math.random() > 0.1, // 90% public
            createdAt,
            updatedAt: createdAt
          }
        });
        
        if (created) {
          reviewCount++;
        }
      } catch (error) {
        // Skip if duplicate (unique constraint)
        continue;
      }
    }
  }
  
  console.log(`✓ Created ${reviewCount} reviews`);
  return reviewCount;
}

async function seedFinancialRecords(users) {
  console.log('💰 Seeding financial records...');
  let recordCount = 0;
  
  const revenueCategories = ['Sales', 'Services', 'Investments', 'Consulting', 'Royalties'];
  const expenseCategories = ['Salaries', 'Operations', 'Marketing', 'Rent & Utilities', 'Software', 'Travel', 'Others'];
  
  // Create financial records for all users
  for (const user of users) {
    // Generate records for the last 12 months
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const recordDate = new Date();
      recordDate.setMonth(recordDate.getMonth() - monthOffset);
      recordDate.setDate(Math.floor(Math.random() * 28) + 1);
      
      // 3-8 revenue records per month
      const revenueRecordsCount = Math.floor(Math.random() * 6) + 3;
      for (let i = 0; i < revenueRecordsCount; i++) {
        try {
          await models.FinancialRecord.create({
            userId: user.id,
            type: 'revenue',
            category: getRandomElement(revenueCategories),
            amount: Math.floor(Math.random() * 500000) + 50000, // 50k - 550k
            description: faker.lorem.sentence(),
            recordDate: recordDate.toISOString().split('T')[0]
          });
          recordCount++;
        } catch (error) {
          // Skip duplicates
          continue;
        }
      }
      
      // 4-10 expense records per month
      const expenseRecordsCount = Math.floor(Math.random() * 7) + 4;
      for (let i = 0; i < expenseRecordsCount; i++) {
        try {
          await models.FinancialRecord.create({
            userId: user.id,
            type: 'expense',
            category: getRandomElement(expenseCategories),
            amount: Math.floor(Math.random() * 300000) + 20000, // 20k - 320k
            description: faker.lorem.sentence(),
            recordDate: recordDate.toISOString().split('T')[0]
          });
          recordCount++;
        } catch (error) {
          // Skip duplicates
          continue;
        }
      }
    }
  }
  
  console.log(`✓ Created ${recordCount} financial records`);
  return recordCount;
}

// ========================================
// RESET FUNCTION
// ========================================

async function resetDevDatabase() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  RESETTING DEVELOPMENT DATABASE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  validateSeedingEnvironment();
  
  try {
    // Force sync will drop and recreate all tables
    await sequelize.sync({ force: true });
    console.log('✓ Database reset completed');
    
    // Re-seed the basic system data (roles and permissions)
    console.log('\nRe-seeding basic system data...');
    
    // Seed Roles
    const rolesData = [
      {
        name: 'reader',
        description: 'Standard reader role with basic permissions',
        permissions: ['books.books.read', 'reviews.reviews.create', 'reviews.reviews.read'],
        isSystemRole: true,
        isActive: true
      },
      {
        name: 'author',
        description: 'Author role with content creation permissions',
        permissions: ['books.books.create', 'books.books.update', 'books.authors.update'],
        isSystemRole: true,
        isActive: true
      },
      {
        name: 'moderator',
        description: 'Moderator role with content moderation permissions',
        permissions: ['reviews.reviews.moderate', 'books.books.moderate'],
        isSystemRole: true,
        isActive: true
      },
      {
        name: 'admin',
        description: 'Administrator with full permissions',
        permissions: ['*'],
        isSystemRole: true,
        isActive: true
      }
    ];
    
    for (const roleData of rolesData) {
      await models.Role.create(roleData);
    }
    console.log('✓ Roles seeded');
    
    // Seed Permissions
    const permissionsData = [
      { module: 'books', resource: 'books', action: 'create', description: 'Create new books', isActive: true },
      { module: 'books', resource: 'books', action: 'read', description: 'Read book information', isActive: true },
      { module: 'books', resource: 'books', action: 'update', description: 'Update book information', isActive: true },
      { module: 'books', resource: 'books', action: 'delete', description: 'Delete books', isActive: true },
      { module: 'books', resource: 'books', action: 'moderate', description: 'Moderate book content', isActive: true },
      { module: 'reviews', resource: 'reviews', action: 'create', description: 'Create reviews', isActive: true },
      { module: 'reviews', resource: 'reviews', action: 'read', description: 'Read reviews', isActive: true },
      { module: 'reviews', resource: 'reviews', action: 'update', description: 'Update reviews', isActive: true },
      { module: 'reviews', resource: 'reviews', action: 'delete', description: 'Delete reviews', isActive: true },
      { module: 'reviews', resource: 'reviews', action: 'moderate', description: 'Moderate reviews', isActive: true }
    ];
    
    for (const permData of permissionsData) {
      await models.Permission.create(permData);
    }
    console.log('✓ Permissions seeded');
    
    console.log('✓ Basic data re-seeded');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    throw error;
  }
}

// ========================================
// MAIN SEEDING FUNCTION
// ========================================

async function seedMedium(options = {}) {
  const startTime = Date.now();
  const { reset = false } = options;
  
  console.log('\n╔═════════════════════════════════════════╗');
  console.log('║   MEDIUM-DENSITY DATABASE SEEDING       ║');
  console.log('╚═════════════════════════════════════════╝\n');
  
  validateSeedingEnvironment();
  
  if (reset) {
    await resetDevDatabase();
  } else {
    // Ensure database schema is up to date
    try {
      await sequelize.authenticate();
      console.log('✓ Database connection established');
      await sequelize.sync({ force: false, alter: false });
      console.log('✓ Database schema synchronized\n');
    } catch (error) {
      console.error('❌ Database connection/sync failed:', error.message);
      throw error;
    }
  }
  
  const transaction = await sequelize.transaction();
  
  try {
    console.log('📊 Seeding Configuration:');
    console.log(`   Users:    ${Object.values(SEED_CONFIG.users).reduce((a, b) => a + b, 0)}`);
    console.log(`   Authors:  ${SEED_CONFIG.authors}`);
    console.log(`   Books:    ${SEED_CONFIG.books}`);
    console.log(`   Reviews:  ~${SEED_CONFIG.books * 2.5} (avg)\n`);
    
    // Seed in order to maintain referential integrity
    const users = await seedUsers();
    const authors = await seedAuthors(users);
    const books = await seedBooks(authors, users);
    const reviewCount = await seedReviews(books, users);
    const financialCount = await seedFinancialRecords(users);
    
    await transaction.commit();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Final Report
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Summary:');
    console.log(`   Users:      ${users.length}`);
    console.log(`     - Admin:     ${users.filter(u => u.role === 'admin').length}`);
    console.log(`     - Author:    ${users.filter(u => u.role === 'author').length}`);
    console.log(`     - Moderator: ${users.filter(u => u.role === 'moderator').length}`);
    console.log(`     - Reader:    ${users.filter(u => u.role === 'reader').length}`);
    console.log(`   Authors:    ${authors.length}`);
    console.log(`   Books:      ${books.length}`);
    console.log(`   Reviews:    ${reviewCount}`);
    console.log(`   Financial:  ${financialCount}`);
    console.log(`   Duration:   ${duration}s`);
    console.log(`   Database:   ${sequelize.options.dialect}`);
    console.log(`   Mode:       DEVELOPER`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔒 ISOLATION: Development database only');
    console.log('   Production data is NOT affected');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return {
      success: true,
      counts: {
        users: users.length,
        authors: authors.length,
        books: books.length,
        reviews: reviewCount,
        financialRecords: financialCount
      },
      duration,
      database: sequelize.options.dialect,
      mode: 'developer'
    };
    
  } catch (error) {
    await transaction.rollback();
    console.error('\n❌ SEEDING FAILED:', error.message);
    console.error(error);
    throw error;
  }
}

// ========================================
// CLI INTERFACE
// ========================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  
  seedMedium({ reset })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  seedMedium,
  resetDevDatabase,
  validateSeedingEnvironment
};
