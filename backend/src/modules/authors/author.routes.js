const express = require('express');
const router = express.Router();
const authorController = require('./author.controller');
const { requirePermission } = require('../../auth/middleware/permissions');
const { body } = require('express-validator');

// Validation middleware
const validateAuthor = [
  body('name').notEmpty().withMessage('Name is required'),
  body('website').optional().isURL().withMessage('Invalid website URL')
];

// Public routes
router.get('/', authorController.getAllAuthors);
router.get('/:id', authorController.getAuthorById);

// Protected routes
router.post('/',
  requirePermission('books.authors.create'),
  validateAuthor,
  authorController.createAuthor
);

router.put('/:id',
  requirePermission('books.authors.update'),
  validateAuthor,
  authorController.updateAuthor
);

router.delete('/:id',
  requirePermission('books.authors.delete'),
  authorController.deleteAuthor
);

module.exports = router;
