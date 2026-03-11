/**
 * Employee Routes
 *
 * Defines all employee-related API endpoints
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize employee routes with dependencies
 * @param {Object} employeeController - Employee controller instance
 * @param {Object} authMiddleware - Authentication middleware
 * @param {Object} permissionMiddleware - Permission middleware
 * @returns {Router} Express router
 */
function createEmployeeRoutes(employeeController, authMiddleware, permissionMiddleware) {
  // Apply authentication to all routes
  router.use(authMiddleware.authenticate);

  /**
   * @route   GET /api/employees/statistics
   * @desc    Get organization employee statistics
   * @access  Admin, HR
   */
  router.get(
    '/statistics',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.getStatistics.bind(employeeController)
  );

  /**
   * @route   GET /api/employees/export
   * @desc    Export employees to CSV or JSON
   * @access  Admin, HR
   */
  router.get(
    '/export',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.exportEmployees.bind(employeeController)
  );

  /**
   * @route   POST /api/employees/bulk-import
   * @desc    Bulk import employees
   * @access  Admin, HR
   */
  router.post(
    '/bulk-import',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.bulkImportEmployees.bind(employeeController)
  );

  /**
   * @route   GET /api/employees/department/:department
   * @desc    Get employees by department
   * @access  Admin, HR, Manager
   */
  router.get(
    '/department/:department',
    permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager']),
    employeeController.getEmployeesByDepartment.bind(employeeController)
  );

  /**
   * @route   GET /api/employees
   * @desc    Get all employees (paginated)
   * @access  Admin, HR, Manager
   */
  router.get(
    '/',
    permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager', 'finance']),
    employeeController.getEmployees.bind(employeeController)
  );

  /**
   * @route   GET /api/employees/:id
   * @desc    Get employee by ID
   * @access  Admin, HR, Manager, Self
   */
  router.get(
    '/:id',
    permissionMiddleware.hasAnyRole(['admin', 'hr', 'manager', 'employee']),
    employeeController.getEmployee.bind(employeeController)
  );

  /**
   * @route   POST /api/employees
   * @desc    Create new employee
   * @access  Admin, HR
   */
  router.post(
    '/',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.createEmployee.bind(employeeController)
  );

  /**
   * @route   PUT /api/employees/:id
   * @desc    Update employee
   * @access  Admin, HR
   */
  router.put(
    '/:id',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.updateEmployee.bind(employeeController)
  );

  /**
   * @route   PATCH /api/employees/:id/status
   * @desc    Update employee status
   * @access  Admin, HR
   */
  router.patch(
    '/:id/status',
    permissionMiddleware.hasAnyRole(['admin', 'hr']),
    employeeController.updateEmployeeStatus.bind(employeeController)
  );

  /**
   * @route   DELETE /api/employees/:id
   * @desc    Delete employee (soft delete)
   * @access  Admin
   */
  router.delete(
    '/:id',
    permissionMiddleware.hasRole('admin'),
    employeeController.deleteEmployee.bind(employeeController)
  );

  return router;
}

module.exports = createEmployeeRoutes;
