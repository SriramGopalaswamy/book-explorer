const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const FinancialRecord = sequelize.define('FinancialRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  type: {
    type: DataTypes.ENUM('revenue', 'expense'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  recordDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'record_date'
  }
}, {
  tableName: 'financial_records',
  underscored: true,
  timestamps: true
});

module.exports = FinancialRecord;
