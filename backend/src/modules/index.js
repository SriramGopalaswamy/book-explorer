const User = require('./users/user.model');
const Role = require('./security/role.model');
const Permission = require('./security/permission.model');
const Book = require('./books/book.model');
const Author = require('./authors/author.model');
const Review = require('./reviews/review.model');

// User associations
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });

// Author associations
Author.hasMany(Book, { foreignKey: 'authorId', as: 'books' });

// Book associations
Book.belongsTo(Author, { foreignKey: 'authorId', as: 'author' });
Book.hasMany(Review, { foreignKey: 'bookId', as: 'reviews' });

// Review associations
Review.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  User,
  Role,
  Permission,
  Book,
  Author,
  Review
};
