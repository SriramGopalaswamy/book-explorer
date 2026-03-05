# PostgreSQL-Only Setup

This application now uses **only PostgreSQL** (no Supabase). All data and authentication are handled through the PostgreSQL test database.

## Architecture

- **Frontend**: React + TypeScript (Vite)
- **Backend API**: Express.js server (`backend-api/server.js`)
- **Database**: PostgreSQL (test database)
- **Schema**: `grxbooks` (all tables in this schema)
- **Authentication**: JWT-based auth stored in `auth.users` table

## Setup

### 1. Backend API Server

The backend API server connects to PostgreSQL and provides:
- REST API endpoints for database queries (`/rest/v1/:table`)
- Authentication endpoints (`/auth/v1/*`)
- JWT token-based authentication

**Start the backend:**
```bash
cd backend-api
npm install
npm start
```

The server runs on `http://localhost:3001` by default.

### 2. Frontend

The frontend uses a custom database client that replaces Supabase completely.

**Start the frontend:**
```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:8080` by default.

### 3. Environment Variables

Make sure your `.env` file has:
```env
DATABASE_URL=postgresql://user:password@host:port/database
VITE_API_URL=http://localhost:3001
VITE_USE_BACKEND_API=true
```

## Authentication

- **Sign Up**: Creates user in `auth.users` table with hashed password
- **Sign In**: Validates credentials and returns JWT token
- **Token Storage**: JWT token stored in `localStorage` as `auth_token`
- **Session**: Token is sent in `Authorization: Bearer <token>` header

## Database Schema

- **Schema**: `grxbooks` (all application tables)
- **Auth Schema**: `auth` (contains `auth.users` table)
- **Search Path**: Set to `grxbooks, auth, public` for automatic schema resolution

## API Endpoints

### Authentication
- `POST /auth/v1/signup` - Create new user
- `POST /auth/v1/token` - Sign in (returns JWT)
- `GET /auth/v1/user` - Get current user (requires auth)
- `POST /auth/v1/logout` - Sign out

### Data Queries
- `GET /rest/v1/:table` - Query table (requires auth)
- `POST /rest/v1/:table` - Insert data (requires auth)
- `PATCH /rest/v1/:table` - Update data (requires auth)
- `DELETE /rest/v1/:table` - Delete data (requires auth)

All data endpoints require JWT authentication via `Authorization: Bearer <token>` header.

## Removed Features

- ❌ Supabase client (completely removed)
- ❌ Microsoft 365 authentication (not available with PostgreSQL-only setup)
- ❌ Supabase Edge Functions (replaced with backend API endpoints)
- ❌ Mock data (all removed, using real database)

## Notes

- Email confirmation is automatically set on signup (can be changed if needed)
- Password reset is not yet implemented (stub endpoint returns error)
- All database queries use the `grxbooks` schema prefix in the frontend
- The backend API automatically handles schema resolution via `search_path`
