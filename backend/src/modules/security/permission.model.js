const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Permission = sequelize.define('Permission', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  module: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['books', 'reviews', 'users', 'security']]
    }
  },
  resource: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['create', 'read', 'update', 'delete', 'publish', 'moderate', 'report']]
    }
  },
  description: {
    type: DataTypes.TEXT
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'permissions',
  indexes: [
    {
      unique: true,
      fields: ['module', 'resource', 'action']
    }
  ]
});

// Helper method to get permission string
Permission.prototype.getPermissionString = function() {
  return `${this.module}.${this.resource}.${this.action}`;
};

module.exports = Permission;
