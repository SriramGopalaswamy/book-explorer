const Book = require('./book.model');
const Author = require('../authors/author.model');
const Review = require('../reviews/review.model');
const { Op } = require('sequelize');

// Get all books
exports.getAllBooks = async (req, res) => {
  try {
    const { page = 1, limit = 20, genre, status = 'active', search } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { status };
    
    if (genre) {
      where.genre = genre;
    }
    
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const { count, rows: books } = await Book.findAndCountAll({
      where,
      include: [
        { model: Author, as: 'author', attributes: ['id', 'name', 'avatar'] },
        { model: Review, as: 'reviews', attributes: ['rating'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      books,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch books', details: error.message });
  }
};

// Get book by ID
exports.getBookById = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id, {
      include: [
        { model: Author, as: 'author' },
        { model: Review, as: 'reviews', include: ['user'] }
      ]
    });
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json(book);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch book', details: error.message });
  }
};

// Create book
exports.createBook = async (req, res) => {
  try {
    const book = await Book.create(req.body);
    const fullBook = await Book.findByPk(book.id, {
      include: [{ model: Author, as: 'author' }]
    });
    
    res.status(201).json(fullBook);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create book', details: error.message });
  }
};

// Update book
exports.updateBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    await book.update(req.body);
    const updatedBook = await Book.findByPk(book.id, {
      include: [{ model: Author, as: 'author' }]
    });
    
    res.json(updatedBook);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update book', details: error.message });
  }
};

// Delete book
exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    await book.destroy();
    res.json({ success: true, message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete book', details: error.message });
  }
};

// Get books by genre
exports.getBooksByGenre = async (req, res) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows: books } = await Book.findAndCountAll({
      where: { genre, status: 'active' },
      include: [{ model: Author, as: 'author', attributes: ['id', 'name', 'avatar'] }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['rating', 'DESC']]
    });
    
    res.json({
      genre,
      books,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch books by genre', details: error.message });
  }
};
