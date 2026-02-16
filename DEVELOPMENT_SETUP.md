# Development Environment Setup Guide

## Quick Start (Fresh Clone)

Follow these steps in order for a clean development environment:

### 1. Install Dependencies

```bash
# Install root dependencies (frontend + postinstall triggers backend install)
npm install
```

This will:
- Install frontend dependencies
- Automatically run `npm run backend:install` via postinstall hook
- Install backend dependencies in `backend/` directory

### 2. Seed the Database (CRITICAL!)

```bash
# Navigate to backend
cd backend

# Reset and seed database with roles, permissions, and sample data
npm run db:reset
```

**⚠️ IMPORTANT:** Skipping this step will cause "Failed to initialize dev mode" error!

The `db:reset` command:
- Drops all existing tables
- Recreates schema
- Seeds 4 system roles (reader, author, moderator, admin)
- Seeds 10 permissions
- Seeds sample users, authors, and books

### 3. Build Frontend

```bash
# Return to root directory
cd ..

# Build production bundle
npm run build
```

This creates the `dist/` folder with optimized assets.

### 4. Start the Application

**Option A: Full Stack (Recommended)**

```bash
# Start both frontend dev server and backend simultaneously
npm run dev:fullstack
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

**Option B: Backend Only (for testing with production build)**

```bash
# Start backend (serves production build from dist/)
cd backend
npm start
```

- Application: `http://localhost:3000` (serves static files from dist/)

**Option C: Frontend Dev Server Only**

```bash
# Start Vite dev server with HMR
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend must be started separately

---

## Developer Mode Access

### Accessing Developer Mode:

1. Open application: `http://localhost:3000` or `http://localhost:5173`
2. You'll see the login screen
3. Look for "Developer Mode" button/link
4. Click it to bypass authentication

### Developer Mode Features:

- ✅ Authentication bypass (no login required)
- ✅ Role switcher (test different user roles)
- ✅ Permission matrix viewer
- ✅ Developer toolbar (purple button on right side)
- ✅ Live role impersonation
- ✅ Permission debugging

### Verification Markers:

When running on this branch, you should see:
- Red banner at bottom-left: "BUILD VERIFICATION v[timestamp]"
- DevToolbar shows "🔴 ROLE SWITCHER ACTIVE 🔴"
- Server logs show restart timestamp

---

## Troubleshooting

### Issue: "Failed to initialize dev mode"

**Cause:** Database not seeded (no roles/permissions exist)

**Solution:**
```bash
cd backend
npm run db:reset
# Restart backend server
npm start
```

### Issue: Red verification banner doesn't appear

**Cause:** Browser cache or build not deployed

**Solutions:**
1. Hard refresh: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
2. Clear browser cache completely
3. Rebuild frontend: `npm run build`
4. Restart backend server

### Issue: DevToolbar not showing

**Causes & Solutions:**

1. **Developer mode not activated**
   - Click "Developer Mode" button on login screen

2. **DEV_MODE flag disabled**
   - Check server logs for "Developer Mode: ✓ ENABLED"
   - ENV variables default to dev mode when undefined

3. **Frontend not rebuilt**
   - Run `npm run build`
   - Hard refresh browser

### Issue: Database errors on startup

**Solutions:**

1. **Reset database completely:**
   ```bash
   cd backend
   rm database/dev.sqlite
   npm run db:reset
   ```

2. **Check database file permissions:**
   ```bash
   ls -la backend/database/
   # Should be readable/writable
   ```

---

## Database Commands

### Available Scripts:

```bash
# In backend/ directory:

# Migrate schema only (create tables, don't seed)
npm run migrate

# Seed data (requires migrate first)
npm run seed

# Reset and re-seed (DESTRUCTIVE - drops all data)
npm run db:reset

# Seed medium-density data (users, books, reviews)
# Requires roles/permissions already seeded
npm run seed:dev

# Reset and seed medium data
npm run seed:dev:reset
```

### Recommended Workflow:

**For fresh setup:**
```bash
npm run db:reset        # Complete reset with basic seed data
```

**For adding more test data:**
```bash
npm run seed:dev        # Add realistic test data (keeps existing data)
```

**For complete refresh:**
```bash
npm run seed:dev:reset  # Reset and add full test dataset
```

---

## Environment Variables

### Backend (.env)

Create `backend/.env` (optional - defaults work for development):

```env
# Database (defaults to SQLite)
DATABASE_URL=postgresql://user:password@localhost:5432/bookexplorer
DB_LOGGING=false

# Application
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
DEMO_MODE=false

# Authentication
SESSION_SECRET=your-secret-key-here
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_CALLBACK_URL=http://localhost:3000/api/auth/microsoft/callback

# Admin (for initial setup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@bookexplorer.com
```

### Frontend (.env)

Already configured in root `.env`:

```env
VITE_SUPABASE_PROJECT_ID=qfgudhbrjfjmbamwsfuj
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://qfgudhbrjfjmbamwsfuj.supabase.co
```

**Note:** VITE_API_URL defaults to `http://localhost:3000/api` if not set.

---

## Development Workflow

### Making Code Changes:

1. **Frontend changes:**
   ```bash
   npm run dev          # Starts Vite with HMR
   # Edit files in src/
   # Changes hot-reload automatically
   ```

2. **Backend changes:**
   ```bash
   cd backend
   npm run dev          # Starts nodemon (auto-restart on changes)
   # Edit files in backend/src/
   # Server restarts automatically
   ```

3. **Full stack development:**
   ```bash
   npm run dev:fullstack   # Runs both with live reload
   ```

### Testing Changes:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint
```

### Building for Production:

```bash
# Build frontend
npm run build

# Preview production build
npm run preview

# Build with development mode included
npm run build:dev
```

---

## Project Structure

```
book-explorer/
├── backend/                 # Express.js backend
│   ├── src/
│   │   ├── modules/        # Feature modules (books, reviews, etc.)
│   │   ├── auth/           # Authentication & authorization
│   │   ├── config/         # Configuration files
│   │   └── server.js       # Main server file
│   ├── database/
│   │   ├── dev.sqlite      # SQLite database (dev)
│   │   ├── setup.js        # Basic seed script
│   │   └── seed-medium.js  # Realistic test data
│   └── package.json
├── src/                     # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts (DevMode, AppMode, etc.)
│   ├── pages/              # Page components
│   └── lib/                # Utilities
├── dist/                    # Built frontend (generated)
├── package.json            # Root package.json
└── README.md
```

---

## Common Issues & Solutions

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000
# or
npx kill-port 3000

# Or change port in backend .env
PORT=3001
```

### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules backend/node_modules
rm package-lock.json backend/package-lock.json
npm install
```

### Database Locked

```bash
# Stop all node processes
pkill -f node

# Remove lock files
rm backend/database/dev.sqlite-shm
rm backend/database/dev.sqlite-wal

# Restart server
cd backend && npm start
```

---

## Additional Documentation

- **`DEPLOYMENT_VERIFICATION_REPORT.md`** - Deployment troubleshooting guide
- **`DEV_MODE_BOOT_FAILURE_ROOT_CAUSE.md`** - Dev mode initialization debugging
- **`BROWSER_CACHE_GUIDE.md`** - Browser cache clearing instructions
- **`DEVELOPER_MODE.md`** - Developer mode architecture
- **`RBAC_IMPLEMENTATION.md`** - Role-based access control details
- **`SEEDING_GUIDE.md`** - Database seeding documentation

---

## Getting Help

If you encounter issues:

1. Check server logs for errors
2. Check browser console for frontend errors
3. Verify database is seeded: `cd backend && sqlite3 database/dev.sqlite "SELECT COUNT(*) FROM roles;"`
4. Try clean rebuild: `rm -rf node_modules dist && npm install && npm run build`
5. Review troubleshooting documentation listed above

---

**Last Updated:** 2026-02-16  
**Branch:** copilot/force-clean-build-verification  
**Status:** Development environment fully functional
