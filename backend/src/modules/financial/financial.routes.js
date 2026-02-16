const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../auth/middleware/permissions');
const {
  getFinancialRecords,
  getDashboardStats,
  getMonthlyRevenue,
  getExpenseBreakdown,
  createFinancialRecord
} = require('./financial.controller');

// All routes require authentication
// In dev mode with x-dev-bypass, developer session bypasses auth

// Get all financial records
router.get('/records', requireAuth, getFinancialRecords);

// Get dashboard statistics
router.get('/dashboard-stats', requireAuth, getDashboardStats);

// Get monthly revenue data
router.get('/monthly-revenue', requireAuth, getMonthlyRevenue);

// Get expense breakdown
router.get('/expense-breakdown', requireAuth, getExpenseBreakdown);

// Create new financial record
router.post('/records', requireAuth, createFinancialRecord);

module.exports = router;
