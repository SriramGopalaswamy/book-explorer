const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // Can be null for SSO users
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'reader',
    validate: {
      isIn: [['reader', 'author', 'moderator', 'admin']]
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  avatar: {
    type: DataTypes.STRING
  },
  microsoftId: {
    type: DataTypes.STRING,
    unique: true
  },
  lastLoginAt: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true,
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

User.prototype.validatePassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

module.exports = User;
