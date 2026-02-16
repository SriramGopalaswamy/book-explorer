# Medium-Density Database Seeding System

## Overview

A production-ready database seeding system for the Book Explorer application that generates realistic, relationally-consistent test data for development and testing environments.

## Isolation Strategy

**Option A: Separate Database (Implemented)**

- **Development Environment**: SQLite database (`./database/dev.sqlite`)
- **Production Environment**: PostgreSQL via `DATABASE_URL_PROD`
- **Isolation Method**: Complete physical separation at database level
- **Safety**: Zero cross-contamination; production data never accessible from dev mode

### Why This Approach?

1. **Clean separation**: Different database engines (SQLite vs PostgreSQL)
2. **No query modifications**: No need for environment filters in queries
3. **Performance**: Development uses lightweight SQLite
4. **Safety**: Impossible to accidentally affect production data

## Safety Controls

### Multi-Layer Protection

The seeding system will ONLY run when ALL conditions are met:

```javascript
✓ DEV_MODE === true
✓ NODE_ENV !== 'production'
✓ isProduction === false
```

If any condition fails, seeding is **immediately blocked** with explicit error.

### Example Safety Check Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SEEDING SAFETY VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NODE_ENV:      development
DEV_MODE:      true
isProduction:  false
Database:      sqlite
✓ All safety checks passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Data Volume (Medium Density)

### Summary

| Entity | Count | Details |
|--------|-------|---------|
| **Users** | 48 | 3 admin, 12 author, 8 moderator, 25 reader |
| **Authors** | 45 | Realistic author profiles with bios, websites |
| **Books** | 275 | Varied genres, statuses, realistic metadata |
| **Reviews** | ~550 | Average 2-3 reviews per active book |
| **Roles** | 4 | Pre-existing system roles |
| **Permissions** | 10 | Pre-existing permission definitions |

### Workflow State Distribution

Books are distributed across realistic workflow states:

- **30%** Active (ready for reading)
- **30%** Archived (historical content)
- **20%** Pending (under review)
- **20%** Inactive (disabled/hidden)

### Temporal Distribution

All timestamps are spread across the **last 12 months** to simulate organic growth:

- User creation dates
- Book publication dates
- Review submission dates
- Last login timestamps

## Data Characteristics

### Realistic Data Generation

Uses `@faker-js/faker` library to generate:

- ✅ Real-looking names (first + last)
- ✅ Valid email addresses
- ✅ Professional biographies
- ✅ Varied nationalities
- ✅ Realistic ISBNs (13-digit format)
- ✅ Genre diversity (18+ genres)
- ✅ Natural language descriptions

### NO Generic/Junk Data

❌ Avoids: "Test1", "User123", "Sample Data"  
✅ Generates: Professional, company-like dataset

### RBAC Validation Support

The dataset enables testing of:

1. **Role-based access control**
   - Different users with different roles
   - Permission boundaries enforced
   
2. **Cross-role interactions**
   - Admins creating books
   - Authors updating content
   - Moderators reviewing submissions
   - Readers leaving reviews

3. **Governance scenarios**
   - Records with multiple status transitions
   - Permission-restricted operations
   - Impersonation testing data

4. **Workflow states**
   - Content at various approval stages
   - Time-based filtering scenarios
   - Status transition testing

## Relational Consistency

### Foreign Key Integrity

All relationships are **strictly maintained**:

```sql
✓ Books → Authors (all books have valid authors)
✓ Reviews → Books (all reviews link to existing books)
✓ Reviews → Users (all reviews created by real users)
✓ Users → Roles (all users have valid roles)
```

### Transaction Safety

- ✅ All seeding wrapped in database transaction
- ✅ Rollback on any failure
- ✅ Atomic: either all data or no data

### Verification

After seeding, run integrity check:

```bash
npm run seed:dev

# Verify in database:
sqlite3 backend/database/dev.sqlite "
  SELECT COUNT(*) FROM books WHERE authorId NOT IN (SELECT id FROM authors);
  -- Result should be 0
"
```

## Usage

### CLI Commands

#### 1. Initial/Incremental Seed

```bash
cd backend
npm run seed:dev
```

**What it does:**
- Validates environment safety
- Connects to development database
- Seeds medium-density data
- Reports detailed statistics
- Completes in ~6-7 seconds

**Output:**
```
✅ SEEDING COMPLETED SUCCESSFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Summary:
   Users:      48
   Authors:    45
   Books:      275
   Reviews:    527
   Duration:   6.54s
   Database:   sqlite
   Mode:       DEVELOPER
```

#### 2. Reset and Re-seed

```bash
cd backend
npm run seed:dev:reset
```

**What it does:**
- **⚠️ DESTRUCTIVE**: Drops all tables
- Re-creates schema
- Seeds system data (roles, permissions)
- Seeds medium-density data
- Useful for clean slate testing

**When to use:**
- Starting fresh after schema changes
- Clearing corrupted test data
- Resetting to known state

### API Endpoints (Developer Mode Only)

#### 1. Seed Medium Data

**Endpoint:** `POST /api/dev/seed-medium`

**Requirements:**
- ✅ Authentication required (Bearer token)
- ✅ DEV_MODE must be enabled
- ✅ Any authenticated user can trigger

**Example:**

```bash
# Login first
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bookexplorer.com","password":"admin123"}' \
  | jq -r '.token')

# Trigger seeding
curl -X POST http://localhost:3000/api/dev/seed-medium \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "success": true,
  "message": "Development database seeded successfully",
  "counts": {
    "users": 48,
    "authors": 45,
    "books": 275,
    "reviews": 527
  },
  "duration": "6.54",
  "database": "sqlite",
  "mode": "developer"
}
```

#### 2. Reset Development Data

**Endpoint:** `POST /api/dev/reset-dev-data`

**Requirements:**
- ✅ Authentication required
- ✅ DEV_MODE must be enabled
- ✅ **SuperAdmin/Admin role required**

**Example:**

```bash
curl -X POST http://localhost:3000/api/dev/reset-dev-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "success": true,
  "message": "Development database reset and re-seeded successfully",
  "warning": "All previous data was deleted",
  "counts": { ... },
  "duration": "7.12",
  "database": "sqlite",
  "mode": "developer"
}
```

## Idempotency

### Incremental Seeding

Running `npm run seed:dev` multiple times:

✅ **Safe**: Uses `findOrCreate` for unique constraints  
✅ **Efficient**: Skips existing records  
✅ **Additive**: Adds new data without duplicates

### Email-based Deduplication

Users are deduplicated by email:
- First run: Creates 48 users
- Second run: Finds existing 48, creates 0 new
- Third run: Same behavior

### ISBN-based Deduplication

Books are deduplicated by ISBN:
- Unique ISBNs generated per seed
- Re-running may add more books with new ISBNs

### Full Reset Option

For complete clean slate:
```bash
npm run seed:dev:reset
```

## Expanding the Dataset

### Increase Volume

Edit `/backend/database/seed-medium.js`:

```javascript
const SEED_CONFIG = {
  users: {
    admin: 5,        // Increase from 3
    author: 20,      // Increase from 12
    moderator: 15,   // Increase from 8
    reader: 50       // Increase from 25
  },
  authors: 100,      // Increase from 45
  books: 500,        // Increase from 275
  reviewsPerBook: { min: 0, max: 12 }  // Increase max from 8
};
```

### Add New Genres

```javascript
const GENRES = [
  'Fantasy', 'Science Fiction', 'Mystery',
  // Add more:
  'Cyberpunk', 'Steampunk', 'Urban Fantasy',
  'True Crime', 'Memoir', 'Philosophy'
];
```

### Adjust Status Distribution

```javascript
const STATUS_DISTRIBUTION = [
  { status: 'active', weight: 40 },    // More active books
  { status: 'pending', weight: 30 },   // More pending
  { status: 'inactive', weight: 20 },
  { status: 'archived', weight: 10 }   // Fewer archived
];
```

### Time Range

Adjust temporal spread:

```javascript
function getRandomPastDate(maxMonths = 12) {  // Change to 24 for 2 years
  // ...
}
```

## Verification & Testing

### 1. Data Integrity Check

```bash
cd backend
sqlite3 database/dev.sqlite << 'EOF'
-- No orphaned books
SELECT COUNT(*) FROM books 
WHERE authorId NOT IN (SELECT id FROM authors);

-- No orphaned reviews
SELECT COUNT(*) FROM reviews 
WHERE bookId NOT IN (SELECT id FROM books);

-- All users have valid roles
SELECT COUNT(*) FROM users 
WHERE role NOT IN ('admin', 'author', 'moderator', 'reader');
EOF
```

**Expected output:** All counts should be `0`

### 2. Distribution Check

```bash
sqlite3 database/dev.sqlite << 'EOF'
-- User role distribution
SELECT role, COUNT(*) FROM users GROUP BY role;

-- Book status distribution
SELECT status, COUNT(*) FROM books GROUP BY status;

-- Review counts
SELECT COUNT(*) FROM reviews;
EOF
```

### 3. Dashboard Testing

After seeding:

1. ✅ Start the application
2. ✅ Login with various roles
3. ✅ Verify dashboards load with data
4. ✅ Test pagination (50+ books)
5. ✅ Test filtering by genre/status
6. ✅ Test search functionality
7. ✅ Verify permission enforcement
8. ✅ Test role impersonation with dataset

### 4. Performance Check

```bash
# Measure seeding time
time npm run seed:dev

# Should complete in under 10 seconds
```

## Isolation Verification

### Confirming No Production Impact

1. **Check database file:**
```bash
ls -lh backend/database/
# Should see: dev.sqlite (development data)
# Should NOT see production PostgreSQL data here
```

2. **Verify environment variables:**
```bash
echo $NODE_ENV          # Should be: development
echo $DEV_MODE          # Should be: true
```

3. **Production test (should FAIL):**
```bash
NODE_ENV=production npm run seed:dev
# Expected: ❌ SEEDING BLOCKED error
```

4. **Database dialect check:**
```javascript
// In development:
sequelize.options.dialect === 'sqlite'

// In production (if misconfigured, would be):
sequelize.options.dialect === 'postgres'
```

## Troubleshooting

### Issue: "SEEDING BLOCKED" Error

**Cause:** Safety checks preventing execution

**Solution:** Verify environment:
```bash
echo $NODE_ENV          # Must be: development
echo $DEV_MODE          # Must be: true (or unset)
```

### Issue: "No such table" Error

**Cause:** Database not initialized

**Solution:** Run migration first:
```bash
npm run seed  # Runs basic seed with schema setup
# Then:
npm run seed:dev
```

### Issue: Duplicate Key Errors

**Cause:** Running seed multiple times without reset

**Solution:** Either:
1. Use reset: `npm run seed:dev:reset`
2. Or accept idempotent behavior (will skip duplicates)

### Issue: Foreign Key Constraint Errors

**Cause:** Database corruption or partial data

**Solution:** Reset and re-seed:
```bash
npm run seed:dev:reset
```

## Architecture Notes

### Why Not Schema Separation?

**Rejected Option B:** Using `schema: dev_data` vs `schema: public`

**Reasons:**
- ❌ SQLite doesn't support schemas like PostgreSQL
- ❌ Requires query modifications
- ❌ More complex to implement
- ❌ Potential for mistakes in production

**Current approach is simpler and safer.**

### Why Not Data Tagging?

**Rejected Option C:** Adding `environment: 'dev' | 'prod'` column

**Reasons:**
- ❌ Pollutes production schema
- ❌ Requires filtering every query
- ❌ Risk of forgetting filter in new code
- ❌ Performance overhead
- ❌ Still allows data mixing

**Physical separation is cleaner.**

## Future Enhancements

### Potential Additions

1. **Configurable density:**
   ```bash
   npm run seed:dev -- --density=high  # 1000+ books
   npm run seed:dev -- --density=low   # 50 books
   ```

2. **Custom scenarios:**
   ```bash
   npm run seed:dev -- --scenario=rbac-testing
   npm run seed:dev -- --scenario=performance
   ```

3. **Seed specific entities:**
   ```bash
   npm run seed:dev -- --only=users,books
   ```

4. **Export/import seed data:**
   ```bash
   npm run seed:dev -- --export=snapshot.json
   npm run seed:dev -- --import=snapshot.json
   ```

## Summary

✅ **Isolation:** Complete physical database separation  
✅ **Safety:** Multi-layer production protection  
✅ **Realism:** Faker-generated professional data  
✅ **Volume:** 48 users, 45 authors, 275 books, 550+ reviews  
✅ **Integrity:** Transaction-wrapped with FK enforcement  
✅ **Idempotency:** Safe to run multiple times  
✅ **Performance:** Completes in ~6-7 seconds  
✅ **RBAC:** Supports complete permission testing  
✅ **CLI + API:** Multiple access methods  
✅ **Documented:** Comprehensive usage guide  

**Production is NEVER affected. Development data is isolated.**
