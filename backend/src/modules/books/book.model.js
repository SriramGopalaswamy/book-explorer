const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Book = sequelize.define('Book', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 500]
    }
  },
  isbn: {
    type: DataTypes.STRING,
    unique: true,
    validate: {
      is: /^(?:\d{10}|\d{13})$/
    }
  },
  genre: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  publishedDate: {
    type: DataTypes.DATEONLY
  },
  pageCount: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1
    }
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0,
    validate: {
      min: 0,
      max: 5
    }
  },
  coverImage: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'inactive', 'pending', 'archived']]
    }
  },
  authorId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'authors',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'books',
  indexes: [
    {
      fields: ['authorId']
    },
    {
      fields: ['genre']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = Book;
