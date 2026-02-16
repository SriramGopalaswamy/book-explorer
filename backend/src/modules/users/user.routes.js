const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { requireAuth, requireAdmin } = require('../../auth/middleware/permissions');
const { body } = require('express-validator');

// Validation middleware
const validateUser = [
  body('email').optional().isEmail().normalizeEmail(),
  body('username').optional().isLength({ min: 3, max: 50 }),
  body('displayName').optional().notEmpty()
];

// Admin only routes
router.get('/', requireAdmin, userController.getAllUsers);

// Protected routes
router.get('/profile', requireAuth, userController.getProfile);
router.put('/profile', requireAuth, validateUser, userController.updateProfile);

// Public user profiles
router.get('/:id', userController.getUserById);

// Admin/self update
router.put('/:id', requireAuth, validateUser, userController.updateUser);
router.delete('/:id', requireAdmin, userController.deleteUser);

module.exports = router;
