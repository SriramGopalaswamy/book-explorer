const express = require('express');
const passport = require('./strategies');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../modules/users/user.model');

const router = express.Router();

// Generate JWT token
const generateToken = (user) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      role: user.role 
    },
    secret,
    { expiresIn: '7d' }
  );
};

// Local login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error', details: err.message });
      }
      
      if (!user) {
        return res.status(401).json({ error: info.message || 'Authentication failed' });
      }
      
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Login error', details: err.message });
        }
        
        const token = generateToken(user);
        
        return res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            avatar: user.avatar
          }
        });
      });
    })(req, res, next);
  }
);

// Register new user
router.post('/register',
  body('username').isLength({ min: 3, max: 50 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('displayName').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { username, email, password, displayName } = req.body;
      
      // Check if user exists
      const existingUser = await User.findOne({ 
        where: { 
          [require('sequelize').Op.or]: [{ email }, { username }]
        } 
      });
      
      if (existingUser) {
        return res.status(409).json({ 
          error: 'User already exists',
          message: 'A user with this email or username already exists'
        });
      }
      
      // Create user
      const user = await User.create({
        username,
        email,
        password,
        displayName,
        role: 'reader'
      });
      
      // Log in the user
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Login error', details: err.message });
        }
        
        const token = generateToken(user);
        
        return res.status(201).json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            avatar: user.avatar
          }
        });
      });
    } catch (error) {
      return res.status(500).json({ 
        error: 'Registration failed',
        details: error.message 
      });
    }
  }
);

// Microsoft SSO login
router.get('/microsoft',
  passport.authenticate('microsoft', { prompt: 'select_account' })
);

// Microsoft SSO callback
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/auth?error=sso_failed' }),
  (req, res) => {
    const token = generateToken(req.user);
    // Redirect to frontend with token
    res.redirect(`/?token=${token}`);
  }
);

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout error', details: err.message });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      displayName: req.user.displayName,
      role: req.user.role,
      avatar: req.user.avatar
    }
  });
});

module.exports = router;
