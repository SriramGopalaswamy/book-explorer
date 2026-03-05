# Login & Authentication Flow

## Complete User Journey Flowchart

```mermaid
flowchart TD
    Start([User Visits App]) --> AppLoad[App.tsx Loads]
    AppLoad --> Providers[Initialize Providers:<br/>AuthProvider, SubscriptionProvider]
    
    Providers --> RouteCheck{Which Route?}
    
    RouteCheck -->|/auth| AuthPage[Show Login Page]
    RouteCheck -->|/auth/callback| AuthCallback[Handle OAuth Callback]
    RouteCheck -->|Protected Route| ProtectedRouteCheck
    
    AuthPage --> UserInput{User Action}
    UserInput -->|Email/Password| EmailLogin[Email Login]
    UserInput -->|Microsoft 365| MS365Login[MS365 OAuth]
    
    EmailLogin --> BackendAuth[Backend: /auth/v1/token]
    MS365Login --> MS365Auth[Backend: /functions/v1/ms365-auth]
    
    BackendAuth --> ValidatePassword{Password Valid?}
    ValidatePassword -->|No| AuthError[Show Error]
    ValidatePassword -->|Yes| GenerateJWT[Generate JWT Token]
    
    MS365Auth --> ExchangeCode[Exchange OAuth Code]
    ExchangeCode --> GetMSProfile[Get MS365 Profile]
    GetMSProfile --> CheckDomain{@grx10.com?}
    CheckDomain -->|No| DomainError[403: Domain Not Allowed]
    CheckDomain -->|Yes| CreateOrFindUser[Create/Find User in auth.users]
    CreateOrFindUser --> SyncProfile[Sync Profile to grxbooks.profiles]
    SyncProfile --> GenerateJWT
    
    GenerateJWT --> StoreToken[Store Token in localStorage]
    StoreToken --> SetUser[Set User in AuthContext]
    SetUser --> AuthCallback
    
    AuthCallback --> ProtectedRouteCheck{ProtectedRoute Check}
    
    ProtectedRouteCheck --> HasUser{User Authenticated?}
    HasUser -->|No| RedirectAuth[Redirect to /auth]
    HasUser -->|Yes| SubscriptionGuardCheck
    
    SubscriptionGuardCheck --> IsExempt{Exempt Route?<br/>/auth, /subscription/activate,<br/>/onboarding, /platform}
    IsExempt -->|Yes| AllowAccess[Allow Access]
    IsExempt -->|No| CheckUser{User Exists?}
    
    CheckUser -->|No| AllowAccess
    CheckUser -->|Yes| CheckSuperAdmin{Is Super Admin?}
    
    CheckSuperAdmin -->|Yes| AllowAccess
    CheckSuperAdmin -->|No| CheckLoading{Loading?}
    
    CheckLoading -->|Yes| ShowLoading[Show: Verifying subscription...]
    CheckLoading -->|No| CheckSubscription{Has Subscription?}
    
    CheckSubscription -->|No| RedirectActivate[Redirect to /subscription/activate]
    CheckSubscription -->|Yes| CheckStatus{Subscription Status?}
    
    CheckStatus -->|Expired| ReadOnlyMode[Allow Access: Read-Only Mode]
    CheckStatus -->|Active| CheckOnboarding{Org Onboarded?}
    
    CheckOnboarding -->|No| RedirectOnboarding[Redirect to /onboarding]
    CheckOnboarding -->|Yes| AllowAccess
    
    AllowAccess --> Dashboard[Show Dashboard/App]
    RedirectAuth --> AuthPage
    RedirectActivate --> ActivatePage[Subscription Activation Page]
    RedirectOnboarding --> OnboardingPage[Onboarding Page]
    AuthError --> AuthPage
    DomainError --> AuthPage
    
    style Start fill:#e1f5ff
    style Dashboard fill:#c8e6c9
    style AuthPage fill:#fff9c4
    style AuthError fill:#ffcdd2
    style DomainError fill:#ffcdd2
    style ShowLoading fill:#fff9c4
    style RedirectActivate fill:#ffccbc
    style RedirectOnboarding fill:#ffccbc
```

## Detailed Component Flow

### 1. Initial App Load
```
User → App.tsx
  ├─ QueryClientProvider (React Query)
  ├─ ThemeProvider
  ├─ AuthProvider
  │   └─ Checks localStorage for auth_token
  │       ├─ If token exists → Validates with /auth/v1/user
  │       └─ If no token → user = null
  ├─ SubscriptionProvider
  │   └─ Only runs if user exists
  │       ├─ Fetches organization_id from profiles
  │       └─ Fetches subscription from subscriptions
  └─ Routes
```

### 2. Authentication Flow

#### Email/Password Login
```
User enters credentials
  ↓
Auth.tsx → supabase.auth.signInWithPassword()
  ↓
DatabaseClient.signInWithPassword()
  ↓
POST /auth/v1/token
  ↓
Backend validates:
  ├─ Check auth.users table
  ├─ Verify password with bcrypt
  ├─ Check email_confirmed_at (auto-set if null)
  └─ Generate JWT token
  ↓
Store token in localStorage
  ↓
Update AuthContext (user, session)
  ↓
Redirect to / (home)
```

#### Microsoft 365 Login
```
User clicks "Sign in with Microsoft 365"
  ↓
Auth.tsx → supabase.functions.invoke("ms365-auth", { action: "get_auth_url" })
  ↓
Backend generates Azure AD auth URL
  ↓
User redirected to Microsoft login
  ↓
User authenticates with Microsoft
  ↓
Redirect to /auth/callback?code=...
  ↓
AuthCallback.tsx → supabase.functions.invoke("ms365-auth", { action: "exchange_code" })
  ↓
Backend:
  ├─ Exchange code for tokens
  ├─ Get user profile from Microsoft Graph
  ├─ Verify @grx10.com domain
  ├─ Create/find user in auth.users
  ├─ Sync profile to grxbooks.profiles
  └─ Generate JWT token
  ↓
Store token in localStorage
  ↓
Update AuthContext
  ↓
Redirect to / (home)
```

### 3. Route Protection Flow

```
User navigates to protected route
  ↓
ProtectedRoute component
  ├─ Checks AuthContext.user
  ├─ If no user → Redirect to /auth
  └─ If user exists → Continue
  ↓
SubscriptionGuard component
  ├─ Check if route is exempt (/auth, /subscription/activate, etc.)
  ├─ If exempt → Allow access
  ├─ If not exempt:
  │   ├─ Check if user exists (if not, let ProtectedRoute handle)
  │   ├─ Check if super_admin (bypass all checks)
  │   ├─ Check subscription status:
  │   │   ├─ No subscription → Redirect to /subscription/activate
  │   │   ├─ Expired → Allow (read-only mode)
  │   │   └─ Active → Check onboarding
  │   └─ If active but not onboarded → Redirect to /onboarding
  └─ All checks pass → Allow access
```

### 4. Super Admin Bypass

```
User logs in
  ↓
SubscriptionGuard checks: useIsSuperAdmin()
  ↓
Query: grxbooks.platform_roles WHERE user_id = ? AND role = 'super_admin'
  ↓
If found → Bypass ALL subscription checks
  ↓
Direct access to all routes (including /platform/*)
```

## Key Components

### AuthContext
- **State**: `user`, `session`, `loading`
- **Methods**: `signIn()`, `signUp()`, `signOut()`, `resetPassword()`
- **Initialization**: Checks localStorage for token on mount

### SubscriptionContext
- **State**: `needsActivation`, `readOnlyMode`, `onboardingRequired`, `plan`, `loading`
- **Dependencies**: Requires authenticated user and organization_id
- **Queries**: 
  - Organization from `grxbooks.profiles`
  - Subscription from `grxbooks.subscriptions`

### ProtectedRoute
- **Purpose**: Ensure user is authenticated
- **Action**: Redirects to `/auth` if no user

### SubscriptionGuard
- **Purpose**: Ensure subscription is active (unless superadmin)
- **Bypass**: Super admins skip all checks
- **Actions**: 
  - Redirect to `/subscription/activate` if no subscription
  - Redirect to `/onboarding` if not onboarded
  - Allow read-only access if expired

## Database Tables Involved

1. **auth.users** - User authentication (email, password hash)
2. **grxbooks.profiles** - User profile (organization_id, full_name, etc.)
3. **grxbooks.platform_roles** - Super admin designation
4. **grxbooks.organizations** - Organization details
5. **grxbooks.subscriptions** - Subscription status and plan

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing JWT tokens
- `AZURE_CLIENT_ID` - Microsoft 365 OAuth client ID
- `AZURE_CLIENT_SECRET` - Microsoft 365 OAuth secret
- `AZURE_TENANT_ID` - Microsoft 365 tenant ID
