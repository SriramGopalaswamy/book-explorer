const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Author = sequelize.define('Author', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  biography: {
    type: DataTypes.TEXT
  },
  birthDate: {
    type: DataTypes.DATEONLY
  },
  nationality: {
    type: DataTypes.STRING
  },
  avatar: {
    type: DataTypes.STRING
  },
  website: {
    type: DataTypes.STRING,
    validate: {
      isUrl: true
    }
  }
}, {
  timestamps: true,
  tableName: 'authors'
});

module.exports = Author;
