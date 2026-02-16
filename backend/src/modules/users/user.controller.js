const User = require('./user.model');
const Review = require('../reviews/review.model');
const { Op } = require('sequelize');

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { displayName: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (role) {
      where.role = role;
    }
    
    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [{ 
        model: Review, 
        as: 'reviews',
        where: { isPublic: true },
        required: false
      }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is updating their own profile or is admin
    if (user.id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }
    
    // Prevent non-admins from changing role
    if (req.body.role && req.user.role !== 'admin') {
      delete req.body.role;
    }
    
    await user.update(req.body);
    
    const updatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });
    
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update user', details: error.message });
  }
};

// Delete user (admin only)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent deleting own account
    if (user.id === req.user.id) {
      return res.status(400).json({ 
        error: 'Cannot delete own account',
        message: 'You cannot delete your own account while logged in.'
      });
    }
    
    await user.destroy();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Review, as: 'reviews' }]
    });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    // Don't allow role change through profile update
    delete req.body.role;
    
    await user.update(req.body);
    
    const updatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });
    
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update profile', details: error.message });
  }
};
