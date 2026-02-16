const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { requirePermission, requireAuth } = require('../../auth/middleware/permissions');
const { body } = require('express-validator');

// Validation middleware
const validateReview = [
  body('bookId').isUUID().withMessage('Valid book ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('reviewText').optional().isString(),
  body('isPublic').optional().isBoolean()
];

// Public routes
router.get('/', reviewController.getAllReviews);
router.get('/:id', reviewController.getReviewById);

// Protected routes
router.post('/',
  requireAuth,
  requirePermission('reviews.reviews.create'),
  validateReview,
  reviewController.createReview
);

router.put('/:id',
  requireAuth,
  validateReview,
  reviewController.updateReview
);

router.delete('/:id',
  requireAuth,
  reviewController.deleteReview
);

module.exports = router;
