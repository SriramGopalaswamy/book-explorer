const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  bookId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'books',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5
    }
  },
  reviewText: {
    type: DataTypes.TEXT
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'reviews',
  indexes: [
    {
      fields: ['bookId']
    },
    {
      fields: ['userId']
    },
    {
      unique: true,
      fields: ['bookId', 'userId']
    }
  ]
});

module.exports = Review;
