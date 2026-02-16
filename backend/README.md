# Book Explorer Backend

Enterprise-grade backend API for Book Explorer application.

## Features

- **Authentication**: Microsoft SSO + Local email/password
- **RBAC**: Role-Based Access Control with granular permissions
- **Demo Mode**: Read-only mode for demonstrations
- **Database**: PostgreSQL (production) / SQLite (development)
- **API**: RESTful API with comprehensive book management

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL (for production) or SQLite (for development)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### Database Setup

```bash
# Run migrations
npm run migrate

# Seed initial data
npm run seed

# Or reset and seed database
npm run db:reset
```

### Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `SESSION_SECRET`: Secret key for session encryption
- `DATABASE_URL`: PostgreSQL connection string (production)

### Optional Variables

- `MICROSOFT_CLIENT_ID`: For Microsoft SSO
- `MICROSOFT_CLIENT_SECRET`: For Microsoft SSO
- `DEMO_MODE`: Set to `true` to enable read-only mode
- `PORT`: Server port (default: 3000)

## API Endpoints

### Authentication
- `POST /api/auth/login` - Local login
- `POST /api/auth/register` - User registration
- `GET /api/auth/microsoft` - Microsoft SSO login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Books
- `GET /api/books` - List books
- `GET /api/books/:id` - Get book details
- `POST /api/books` - Create book (requires permission)
- `PUT /api/books/:id` - Update book (requires permission)
- `DELETE /api/books/:id` - Delete book (requires permission)

### Authors
- `GET /api/authors` - List authors
- `GET /api/authors/:id` - Get author details
- `POST /api/authors` - Create author (requires permission)
- `PUT /api/authors/:id` - Update author (requires permission)
- `DELETE /api/authors/:id` - Delete author (requires permission)

### Reviews
- `GET /api/reviews` - List reviews
- `GET /api/reviews/:id` - Get review details
- `POST /api/reviews` - Create review (requires auth)
- `PUT /api/reviews/:id` - Update review (requires auth)
- `DELETE /api/reviews/:id` - Delete review (requires auth)

### Users
- `GET /api/users` - List users (admin only)
- `GET /api/users/:id` - Get user profile
- `GET /api/users/profile` - Get own profile
- `PUT /api/users/profile` - Update own profile
- `PUT /api/users/:id` - Update user (admin/self)
- `DELETE /api/users/:id` - Delete user (admin only)

### Security (RBAC)
- `GET /api/security/roles` - List roles (admin only)
- `GET /api/security/permissions` - List permissions (admin only)
- `GET /api/security/permission-matrix` - Get permission matrix (admin only)
- `POST /api/security/roles` - Create role (admin only)
- `PUT /api/security/roles/:id` - Update role (admin only)
- `DELETE /api/security/roles/:id` - Delete role (admin only)

## RBAC System

### Roles

- **Reader**: Basic user with read access and ability to create reviews
- **Author**: Can create and manage books and author profiles
- **Moderator**: Can moderate reviews and books
- **Admin**: Full system access

### Permissions Format

Permissions follow the format: `module.resource.action`

Examples:
- `books.books.read`
- `books.books.create`
- `reviews.reviews.moderate`

## Demo Mode

When `DEMO_MODE=true`, all mutation requests (POST, PUT, DELETE, PATCH) will be blocked with a 403 response.

## Database Models

### Core Models
- **Book**: Book information and metadata
- **Author**: Author profiles
- **Review**: User reviews and ratings
- **User**: User accounts

### RBAC Models
- **Role**: User roles with permissions
- **Permission**: System permissions

## Default Credentials

After seeding the database:

- **Admin**: admin@bookexplorer.com / admin123
- **Reader**: reader@example.com / reader123

**⚠️ Change these credentials in production!**

## Architecture

```
backend/
├── src/
│   ├── auth/              # Authentication & authorization
│   │   ├── middleware/    # Auth middleware (permissions, demo mode)
│   │   ├── strategies/    # Passport strategies
│   │   └── auth.routes.js # Auth routes
│   ├── config/            # Configuration files
│   │   └── database.js    # Database configuration
│   ├── modules/           # Feature modules
│   │   ├── books/         # Books module
│   │   ├── authors/       # Authors module
│   │   ├── reviews/       # Reviews module
│   │   ├── users/         # Users module
│   │   └── security/      # RBAC module
│   └── server.js          # Express server setup
├── database/              # Database files
│   ├── migrations/        # Database migrations
│   ├── seeds/             # Seed data
│   └── setup.js           # Database setup script
└── package.json           # Dependencies and scripts
```

## Development

### Running Tests

```bash
npm test
```

### Database Management

```bash
# Reset database (⚠️ destructive)
npm run db:reset

# Run migrations only
npm run migrate

# Seed data only
npm run seed
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure `DATABASE_URL` for PostgreSQL
3. Set strong `SESSION_SECRET`
4. Enable SSL for database if needed
5. Configure Microsoft SSO credentials
6. Run migrations: `npm run migrate`
7. Seed initial data: `npm run seed`
8. Start server: `npm start`

## Security Considerations

- Always use HTTPS in production
- Change default admin credentials
- Keep `SESSION_SECRET` secure and unique
- Enable database SSL in production
- Regularly update dependencies
- Review and audit permissions regularly

## Support

For issues and questions, please open an issue on GitHub.
