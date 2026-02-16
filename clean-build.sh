#!/bin/bash

# ============================================
# CLEAN BUILD SCRIPT
# Force clean rebuild of the entire application
# ============================================

echo "========================================"
echo "🧹 Starting Clean Build Process"
echo "========================================"
echo ""

# Step 1: Remove node_modules
echo "📦 Step 1: Removing node_modules..."
rm -rf node_modules
rm -rf backend/node_modules
echo "✓ node_modules removed"
echo ""

# Step 2: Remove build artifacts
echo "🗑️  Step 2: Removing build artifacts..."
rm -rf dist
rm -rf build
rm -rf backend/dist
rm -rf backend/build
echo "✓ Build artifacts removed"
echo ""

# Step 3: Remove lock files (optional - be careful!)
echo "🔒 Step 3: Lock files status..."
echo "   - package-lock.json: $([ -f package-lock.json ] && echo 'exists' || echo 'not found')"
echo "   - bun.lockb: $([ -f bun.lockb ] && echo 'exists' || echo 'not found')"
echo "   - backend/package-lock.json: $([ -f backend/package-lock.json ] && echo 'exists' || echo 'not found')"
echo ""
echo "⚠️  Lock files NOT removed for safety. To remove, run:"
echo "   rm -f package-lock.json bun.lockb backend/package-lock.json"
echo ""

# Step 4: Install dependencies
echo "📥 Step 4: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✓ Dependencies installed"
echo ""

# Step 5: Build frontend
echo "🏗️  Step 5: Building frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build frontend"
    exit 1
fi
echo "✓ Frontend built successfully"
echo ""

# Step 6: Summary
echo "========================================"
echo "✅ Clean Build Complete!"
echo "========================================"
echo ""
echo "📊 Build Summary:"
echo "   - Frontend: $(ls -lh dist/assets/*.js 2>/dev/null | wc -l) JS files"
echo "   - CSS: $(ls -lh dist/assets/*.css 2>/dev/null | wc -l) CSS files"
echo "   - Dist size: $(du -sh dist 2>/dev/null | cut -f1)"
echo ""
echo "🚀 Next Steps:"
echo "   1. Start backend: cd backend && npm start"
echo "   2. Or start both: npm run dev:fullstack"
echo "   3. Access app at: http://localhost:3000"
echo ""
echo "🔍 Deployment Verification:"
echo "   - Check for red banner: 'BUILD VERIFICATION'"
echo "   - Check server logs for restart timestamp"
echo "   - Open DevToolbar and verify role switcher"
echo ""
