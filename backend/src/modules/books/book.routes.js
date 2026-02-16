const express = require('express');
const router = express.Router();
const bookController = require('./book.controller');
const { requirePermission } = require('../../auth/middleware/permissions');
const { body } = require('express-validator');

// Validation middleware
const validateBook = [
  body('title').notEmpty().withMessage('Title is required'),
  body('authorId').isUUID().withMessage('Valid author ID is required'),
  body('isbn').optional().matches(/^\d{10}(\d{3})?$/).withMessage('Invalid ISBN format'),
  body('pageCount').optional().isInt({ min: 1 }).withMessage('Page count must be a positive integer'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5')
];

// Public routes (read-only)
router.get('/', bookController.getAllBooks);
router.get('/:id', bookController.getBookById);
router.get('/genre/:genre', bookController.getBooksByGenre);

// Protected routes (require permissions)
router.post('/', 
  requirePermission('books.books.create'),
  validateBook,
  bookController.createBook
);

router.put('/:id',
  requirePermission('books.books.update'),
  validateBook,
  bookController.updateBook
);

router.delete('/:id',
  requirePermission('books.books.delete'),
  bookController.deleteBook
);

module.exports = router;
