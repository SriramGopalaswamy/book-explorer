# Developer Mode in Production Deployments

## Overview

This document explains how to enable developer mode features when deploying the application.

## Environment Variables

### Frontend (.env)

The root `.env` file contains public Supabase configuration and dev mode flags:

```bash
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=true
```

**Note**: The root `.env` file is committed to the repository because:
1. Supabase publishable keys are designed to be public (not secret)
2. They are used in the browser and visible in network requests
3. Dev mode flags are non-sensitive boolean configuration

### Backend (backend/.env)

The backend `.env` file is gitignored and should be created manually:

```bash
DEV_MODE=true
ALLOW_PERMISSION_EDITING=true
NODE_ENV=development
SESSION_SECRET=your-secret-here
```

**Important**: `backend/.env` is in `.gitignore` and should NEVER be committed.

## Security Considerations

### Dev Mode in Production

Enabling dev mode in production provides powerful debugging tools but should be used with caution:

**Enabled Features:**
- Role impersonation (switch between roles without database changes)
- Permission matrix debugging
- Live permission governance
- Developer authentication bypass

**Security Measures in Place:**
1. **Explicit Opt-in**: Dev mode must be explicitly enabled via environment variables
2. **Backend Validation**: All permission checks still occur on the backend
3. **Header-based Control**: Developer bypass requires `x-dev-bypass: true` header
4. **Audit Logging**: All dev mode actions are logged
5. **No Database Modifications**: Role switching only affects headers, not database

### Recommended Deployment Strategy

**For Development/Staging:**
```bash
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=true
```

**For Production:**
```bash
# Option 1: Disable dev mode completely
VITE_DEV_MODE=false
VITE_ALLOW_PERMISSION_EDITING=false

# Option 2: Enable read-only dev tools
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=false

# Option 3: Full dev mode (for internal tools)
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=true
```

## Deployment Checklist

- [ ] Set appropriate `VITE_DEV_MODE` for your environment
- [ ] Set appropriate `VITE_ALLOW_PERMISSION_EDITING` for your environment
- [ ] Create `backend/.env` with appropriate flags
- [ ] Set `SESSION_SECRET` in backend/.env
- [ ] Configure CORS allowed origins for your domains
- [ ] Review audit logs regularly if dev mode is enabled
- [ ] Consider IP allowlisting for dev mode access
- [ ] Document who has access to dev mode features

## Troubleshooting

### "Failed to initialize dev mode" Error

**Symptoms:**
- Error toast appears in browser
- Dev toolbar doesn't appear
- Console shows "DEV MODE INITIALIZATION FAILED"

**Solution:**
1. Check `VITE_DEV_MODE=true` is set in .env
2. Rebuild the frontend: `npm run build`
3. Check backend `DEV_MODE=true` is set in backend/.env
4. Restart backend server
5. Verify CORS allows your frontend origin

### Role Switcher Not Working

**Symptoms:**
- Role switcher doesn't show any roles
- Role dropdown is empty
- No roles loaded

**Solution:**
1. Check database has been seeded: `npm run backend:reset`
2. Check backend dev mode is enabled
3. Check browser console for API errors
4. Verify `x-dev-bypass: true` header is being sent

### CORS Errors

**Symptoms:**
- API requests blocked by CORS policy
- "Access to fetch has been blocked by CORS" in console

**Solution:**
1. Add your frontend URL to backend CORS config in `backend/src/server.js`
2. Common ports: 5173 (dev), 4173 (preview), 8080 (alternate)
3. Restart backend after changing CORS config

## Architecture

Dev mode uses a layered architecture:

```
┌─────────────────────────────────────────┐
│     Environment Variables (.env)        │
│  VITE_DEV_MODE / DEV_MODE               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      System Flags (systemFlags.ts/js)   │
│  Reads env vars, sets DEV_MODE flag     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   Frontend: AppModeContext              │
│  Manages developer/production modes     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   Frontend: DevModeContext              │
│  Fetches roles, manages role switching  │
│  Sets x-dev-role header on API calls    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   Backend: developerBypass.js           │
│  Reads x-dev-bypass header              │
│  Creates mock developer user            │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   Backend: resolveEffectiveRole.js      │
│  Reads x-dev-role header                │
│  Sets req.effectiveRole                 │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   Backend: Permission Checks            │
│  Uses req.effectiveRole for validation  │
└─────────────────────────────────────────┘
```

## Additional Resources

- [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) - Full developer mode documentation
- [RBAC_IMPLEMENTATION.md](./RBAC_IMPLEMENTATION.md) - RBAC system architecture
- [DEV_MODE_BOOT_FAILURE_ROOT_CAUSE.md](./DEV_MODE_BOOT_FAILURE_ROOT_CAUSE.md) - Previous troubleshooting guide
