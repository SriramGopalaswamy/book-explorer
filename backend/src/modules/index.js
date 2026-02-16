const User = require('./users/user.model');
const Role = require('./security/role.model');
const Permission = require('./security/permission.model');
const Book = require('./books/book.model');
const Author = require('./authors/author.model');
const Review = require('./reviews/review.model');
const FinancialRecord = require('./financial/financialRecord.model');

// ============================================================================
// ASSOCIATION GUARD: Prevent duplicate association registration
// This flag ensures associations are only defined once, even if this module
// is required multiple times due to circular dependencies or multiple imports
// ============================================================================
let associationsInitialized = false;

/**
 * Initialize all model associations
 * This function is idempotent - it can be safely called multiple times
 * but will only execute once to prevent Sequelize duplicate alias errors
 */
function initializeAssociations() {
  if (associationsInitialized) {
    // Already initialized - skip silently to avoid log clutter
    return;
  }

  console.log('🔗 Initializing model associations...');

  // User associations
  User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
  User.hasMany(FinancialRecord, { foreignKey: 'userId', as: 'financialRecords' });

  // Author associations
  Author.hasMany(Book, { foreignKey: 'authorId', as: 'books' });

  // Book associations
  Book.belongsTo(Author, { foreignKey: 'authorId', as: 'author' });
  Book.hasMany(Review, { foreignKey: 'bookId', as: 'reviews' });

  // Review associations
  Review.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
  Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // FinancialRecord associations
  FinancialRecord.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Mark as initialized
  associationsInitialized = true;
  console.log('✓ Core models initialized successfully');
}

// Initialize associations immediately when this module is first loaded
initializeAssociations();

module.exports = {
  User,
  Role,
  Permission,
  Book,
  Author,
  Review,
  FinancialRecord,
  initializeAssociations // Export for explicit re-initialization if needed
};
