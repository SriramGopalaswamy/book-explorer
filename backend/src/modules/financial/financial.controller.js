const FinancialRecord = require('./financialRecord.model');
const { Op } = require('sequelize');

/**
 * Get all financial records for current user (or all in dev mode)
 */
const getFinancialRecords = async (req, res) => {
  try {
    const { user, isDeveloperSession } = req;
    
    // In dev mode, return all records; otherwise filter by user
    const where = isDeveloperSession ? {} : { userId: user.id };
    
    const records = await FinancialRecord.findAll({
      where,
      order: [['recordDate', 'DESC']],
      limit: 1000 // Safety limit
    });
    
    console.log(`📊 Financial records query: ${records.length} records (devMode: ${isDeveloperSession})`);
    
    res.json({ records });
  } catch (error) {
    console.error('Error fetching financial records:', error);
    res.status(500).json({ 
      error: 'Failed to fetch financial records', 
      details: error.message 
    });
  }
};

/**
 * Get dashboard statistics
 */
const getDashboardStats = async (req, res) => {
  try {
    const { user, isDeveloperSession } = req;
    
    // In dev mode, aggregate all records; otherwise filter by user
    const where = isDeveloperSession ? {} : { userId: user.id };
    
    // Get current and last month data
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Current month revenue
    const currentRevenue = await FinancialRecord.sum('amount', {
      where: {
        ...where,
        type: 'revenue',
        recordDate: { [Op.gte]: currentMonthStart.toISOString().split('T')[0] }
      }
    }) || 0;
    
    // Last month revenue
    const lastMonthRevenue = await FinancialRecord.sum('amount', {
      where: {
        ...where,
        type: 'revenue',
        recordDate: {
          [Op.gte]: lastMonthStart.toISOString().split('T')[0],
          [Op.lte]: lastMonthEnd.toISOString().split('T')[0]
        }
      }
    }) || 0;
    
    const revenueChange = lastMonthRevenue > 0
      ? ((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;
    
    // For demo purposes, return some defaults for other stats
    const stats = {
      totalRevenue: currentRevenue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      activeEmployees: 127,
      employeeChange: 3,
      pendingInvoices: 23,
      invoiceChange: -5,
      goalsAchieved: 85,
      goalsChange: 8
    };
    
    console.log(`📊 Dashboard stats: revenue=${currentRevenue}, change=${revenueChange}%`);
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard stats', 
      details: error.message 
    });
  }
};

/**
 * Get monthly revenue data
 */
const getMonthlyRevenue = async (req, res) => {
  try {
    const { user, isDeveloperSession } = req;
    const { fromDate, toDate } = req.query;
    
    // Default to last 6 months if not specified
    const from = fromDate || (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().split('T')[0];
    })();
    
    const to = toDate || new Date().toISOString().split('T')[0];
    
    const where = {
      ...(isDeveloperSession ? {} : { userId: user.id }),
      recordDate: {
        [Op.gte]: from,
        [Op.lte]: to
      }
    };
    
    const records = await FinancialRecord.findAll({
      where,
      attributes: ['type', 'amount', 'recordDate'],
      order: [['recordDate', 'ASC']]
    });
    
    // Group by month
    const monthlyMap = new Map();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    records.forEach(record => {
      const date = new Date(record.recordDate);
      const monthKey = `${months[date.getMonth()]} ${date.getFullYear()}`;
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { month: months[date.getMonth()], revenue: 0, expenses: 0 });
      }
      
      const current = monthlyMap.get(monthKey);
      if (record.type === 'revenue') {
        current.revenue += Number(record.amount);
      } else {
        current.expenses += Number(record.amount);
      }
    });
    
    const monthlyData = Array.from(monthlyMap.values());
    
    console.log(`📊 Monthly revenue: ${monthlyData.length} months`);
    
    res.json({ monthlyData });
  } catch (error) {
    console.error('Error fetching monthly revenue:', error);
    res.status(500).json({ 
      error: 'Failed to fetch monthly revenue', 
      details: error.message 
    });
  }
};

/**
 * Get expense breakdown by category
 */
const getExpenseBreakdown = async (req, res) => {
  try {
    const { user, isDeveloperSession } = req;
    const { fromDate, toDate } = req.query;
    
    // Default to current month if not specified
    const from = fromDate || (() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    })();
    
    const to = toDate || new Date().toISOString().split('T')[0];
    
    const where = {
      ...(isDeveloperSession ? {} : { userId: user.id }),
      type: 'expense',
      recordDate: {
        [Op.gte]: from,
        [Op.lte]: to
      }
    };
    
    const records = await FinancialRecord.findAll({
      where,
      attributes: ['category', 'amount']
    });
    
    // Group by category
    const categoryMap = new Map();
    const categoryColors = {
      'Salaries': 'hsl(222, 47%, 14%)',
      'Operations': 'hsl(262, 52%, 47%)',
      'Marketing': 'hsl(38, 92%, 50%)',
      'Rent & Utilities': 'hsl(199, 89%, 48%)',
      'Software': 'hsl(142, 76%, 36%)',
      'Others': 'hsl(220, 9%, 46%)'
    };
    
    records.forEach(record => {
      const current = categoryMap.get(record.category) || 0;
      categoryMap.set(record.category, current + Number(record.amount));
    });
    
    const breakdown = Array.from(categoryMap.entries()).map(([name, value]) => ({
      name,
      value,
      color: categoryColors[name] || 'hsl(220, 9%, 46%)'
    }));
    
    console.log(`📊 Expense breakdown: ${breakdown.length} categories`);
    
    res.json({ breakdown });
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    res.status(500).json({ 
      error: 'Failed to fetch expense breakdown', 
      details: error.message 
    });
  }
};

/**
 * Create a new financial record
 */
const createFinancialRecord = async (req, res) => {
  try {
    const { user } = req;
    const { type, category, amount, description, recordDate } = req.body;
    
    const record = await FinancialRecord.create({
      userId: user.id,
      type,
      category,
      amount,
      description,
      recordDate
    });
    
    res.status(201).json({ record });
  } catch (error) {
    console.error('Error creating financial record:', error);
    res.status(400).json({ 
      error: 'Failed to create financial record', 
      details: error.message 
    });
  }
};

module.exports = {
  getFinancialRecords,
  getDashboardStats,
  getMonthlyRevenue,
  getExpenseBreakdown,
  createFinancialRecord
};
