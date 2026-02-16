const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./config/database');
const passport = require('./auth/strategies');
const demoModeMiddleware = require('./auth/middleware/demoMode');

// Import routes
const authRoutes = require('./auth/auth.routes');
const bookRoutes = require('./modules/books/book.routes');
const authorRoutes = require('./modules/authors/author.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const userRoutes = require('./modules/users/user.routes');
const securityRoutes = require('./modules/security/security.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development
}));
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Demo mode middleware (applies to all routes)
app.use(demoModeMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    demoMode: process.env.DEMO_MODE === 'true',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/authors', authorRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/security', securityRoutes);

// Serve static files from React build
const frontendBuildPath = path.join(__dirname, '../../dist');
app.use(express.static(frontendBuildPath));

// Serve React app for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Database initialization and server start
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');
    
    // Sync models (create tables if they don't exist)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✓ Database models synchronized');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Demo mode: ${process.env.DEMO_MODE === 'true' ? 'enabled' : 'disabled'}`);
      console.log(`✓ API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
