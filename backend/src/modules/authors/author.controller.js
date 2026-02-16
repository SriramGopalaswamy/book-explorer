const Author = require('./author.model');
const Book = require('../books/book.model');
const { Op } = require('sequelize');

// Get all authors
exports.getAllAuthors = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { biography: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const { count, rows: authors } = await Author.findAndCountAll({
      where,
      include: [{ 
        model: Book, 
        as: 'books', 
        attributes: ['id', 'title', 'coverImage'],
        where: { status: 'active' },
        required: false
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']]
    });
    
    res.json({
      authors,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch authors', details: error.message });
  }
};

// Get author by ID
exports.getAuthorById = async (req, res) => {
  try {
    const author = await Author.findByPk(req.params.id, {
      include: [{ 
        model: Book, 
        as: 'books',
        where: { status: 'active' },
        required: false
      }]
    });
    
    if (!author) {
      return res.status(404).json({ error: 'Author not found' });
    }
    
    res.json(author);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch author', details: error.message });
  }
};

// Create author
exports.createAuthor = async (req, res) => {
  try {
    const author = await Author.create(req.body);
    res.status(201).json(author);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create author', details: error.message });
  }
};

// Update author
exports.updateAuthor = async (req, res) => {
  try {
    const author = await Author.findByPk(req.params.id);
    
    if (!author) {
      return res.status(404).json({ error: 'Author not found' });
    }
    
    await author.update(req.body);
    res.json(author);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update author', details: error.message });
  }
};

// Delete author
exports.deleteAuthor = async (req, res) => {
  try {
    const author = await Author.findByPk(req.params.id);
    
    if (!author) {
      return res.status(404).json({ error: 'Author not found' });
    }
    
    // Check if author has books
    const bookCount = await Book.count({ where: { authorId: author.id } });
    
    if (bookCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete author',
        message: 'Author has associated books. Delete or reassign books first.'
      });
    }
    
    await author.destroy();
    res.json({ success: true, message: 'Author deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete author', details: error.message });
  }
};
