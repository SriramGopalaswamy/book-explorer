const Review = require('./review.model');
const Book = require('../books/book.model');
const User = require('../users/user.model');
const { Op } = require('sequelize');

// Get all reviews
exports.getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, bookId, userId } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { isPublic: true };
    
    if (bookId) {
      where.bookId = bookId;
    }
    
    if (userId) {
      where.userId = userId;
    }
    
    const { count, rows: reviews } = await Review.findAndCountAll({
      where,
      include: [
        { model: Book, as: 'book', attributes: ['id', 'title', 'coverImage'] },
        { model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatar'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      reviews,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews', details: error.message });
  }
};

// Get review by ID
exports.getReviewById = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id, {
      include: [
        { model: Book, as: 'book' },
        { model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatar'] }
      ]
    });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Check if review is public or belongs to current user
    if (!review.isPublic && (!req.user || review.userId !== req.user.id)) {
      return res.status(403).json({ error: 'Access denied to private review' });
    }
    
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch review', details: error.message });
  }
};

// Create review
exports.createReview = async (req, res) => {
  try {
    const { bookId, rating, reviewText, isPublic = true } = req.body;
    
    // Check if book exists
    const book = await Book.findByPk(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    // Check if user already reviewed this book
    const existingReview = await Review.findOne({
      where: {
        bookId,
        userId: req.user.id
      }
    });
    
    if (existingReview) {
      return res.status(409).json({ 
        error: 'Review already exists',
        message: 'You have already reviewed this book. Use update instead.'
      });
    }
    
    const review = await Review.create({
      bookId,
      userId: req.user.id,
      rating,
      reviewText,
      isPublic
    });
    
    // Update book rating
    const allReviews = await Review.findAll({ where: { bookId } });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await book.update({ rating: parseFloat(avgRating.toFixed(2)) });
    
    const fullReview = await Review.findByPk(review.id, {
      include: [
        { model: Book, as: 'book', attributes: ['id', 'title'] },
        { model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatar'] }
      ]
    });
    
    res.status(201).json(fullReview);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create review', details: error.message });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Check if user owns the review
    if (review.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You can only update your own reviews' });
    }
    
    await review.update(req.body);
    
    // Update book rating if rating changed
    if (req.body.rating) {
      const book = await Book.findByPk(review.bookId);
      const allReviews = await Review.findAll({ where: { bookId: review.bookId } });
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await book.update({ rating: parseFloat(avgRating.toFixed(2)) });
    }
    
    const updatedReview = await Review.findByPk(review.id, {
      include: [
        { model: Book, as: 'book', attributes: ['id', 'title'] },
        { model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatar'] }
      ]
    });
    
    res.json(updatedReview);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update review', details: error.message });
  }
};

// Delete review
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Check if user owns the review or is moderator/admin
    if (review.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'You can only delete your own reviews' });
    }
    
    const bookId = review.bookId;
    await review.destroy();
    
    // Update book rating
    const book = await Book.findByPk(bookId);
    const allReviews = await Review.findAll({ where: { bookId } });
    
    if (allReviews.length > 0) {
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await book.update({ rating: parseFloat(avgRating.toFixed(2)) });
    } else {
      await book.update({ rating: 0 });
    }
    
    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete review', details: error.message });
  }
};
