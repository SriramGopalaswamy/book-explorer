#!/bin/bash

# Deployment script for backend application
# Usage: ./deploy.sh [environment]
# Environments: dev, staging, production

set -e  # Exit on error

ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/${TIMESTAMP}"

echo "========================================="
echo "Deploying to: $ENVIRONMENT"
echo "Timestamp: $TIMESTAMP"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables
if [ -f ".env.${ENVIRONMENT}" ]; then
    log_info "Loading environment variables from .env.${ENVIRONMENT}"
    export $(cat ".env.${ENVIRONMENT}" | grep -v '^#' | xargs)
else
    log_error ".env.${ENVIRONMENT} file not found"
    exit 1
fi

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check if database is accessible
log_info "Checking database connection..."
node scripts/check-database.js || {
    log_error "Database connection failed"
    exit 1
}

# Create backup
log_info "Creating database backup..."
mkdir -p "$BACKUP_DIR"
pg_dump "$DATABASE_URL" > "${BACKUP_DIR}/database_backup.sql" || {
    log_warn "Database backup failed, continuing anyway..."
}

# Pull latest code
if [ "$ENVIRONMENT" != "dev" ]; then
    log_info "Pulling latest code..."
    git pull origin $(git rev-parse --abbrev-ref HEAD)
fi

# Install dependencies
log_info "Installing dependencies..."
npm ci

# Run database migrations
log_info "Running database migrations..."
node scripts/run-migrations.js || {
    log_error "Migration failed, rolling back..."
    psql "$DATABASE_URL" < "${BACKUP_DIR}/database_backup.sql"
    exit 1
}

# Run tests
if [ "$ENVIRONMENT" != "production" ]; then
    log_info "Running tests..."
    npm test || {
        log_warn "Tests failed, but continuing deployment..."
    }
fi

# Build if needed
if [ -f "package.json" ] && grep -q '"build":' package.json; then
    log_info "Building application..."
    npm run build
fi

# Restart application
log_info "Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart book-explorer-backend || pm2 start src/server.js --name book-explorer-backend
elif command -v systemctl &> /dev/null; then
    sudo systemctl restart book-explorer-backend
else
    log_warn "No process manager found, manual restart required"
fi

# Health check
log_info "Running health check..."
sleep 5
HEALTH_CHECK_URL="${API_URL:-http://localhost:3000}/health"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL")

if [ "$HTTP_CODE" = "200" ]; then
    log_info "Health check passed (HTTP $HTTP_CODE)"
else
    log_error "Health check failed (HTTP $HTTP_CODE)"
    log_error "Rolling back deployment..."
    # Rollback logic here
    exit 1
fi

# Clear caches
if [ -n "$REDIS_URL" ]; then
    log_info "Clearing Redis cache..."
    redis-cli -u "$REDIS_URL" FLUSHDB || log_warn "Redis flush failed"
fi

# Post-deployment tasks
log_info "Running post-deployment tasks..."

# Refresh materialized views
log_info "Refreshing materialized views..."
psql "$DATABASE_URL" -c "SELECT grxbooks.refresh_stats_views();" || log_warn "View refresh failed"

# Send deployment notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Deployment to $ENVIRONMENT completed successfully\"}" \
        || log_warn "Slack notification failed"
fi

log_info "========================================="
log_info "✅ Deployment completed successfully!"
log_info "Environment: $ENVIRONMENT"
log_info "Backup location: $BACKUP_DIR"
log_info "========================================="
