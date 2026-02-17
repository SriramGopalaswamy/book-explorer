# Lovable.dev Quick Reference

## 🚀 Quick Start with Lovable

### Accessing Your Project
- **Lovable Editor**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID
- **GitHub Repo**: This repository
- **Two-Way Sync**: Changes sync automatically between Lovable and GitHub

### Making Changes

#### Option 1: Via Lovable (Recommended for UI/Components)
1. Go to your Lovable project URL
2. Use natural language prompts to describe changes
3. Review the AI-generated changes
4. Changes are auto-committed to this repo

#### Option 2: Via Local IDE
1. Clone this repo
2. Make your changes
3. Push to GitHub
4. Changes auto-sync to Lovable

## 📝 Lovable AI Prompting Tips

### Component Editing
```
✅ GOOD: "In src/components/dashboard/ModuleCard.tsx, add a new prop 
         'showBadge' (boolean) that displays a 'New' badge when true"

❌ BAD:  "Update the card component"
```

### Creating New Features
```
✅ GOOD: "Create a new page src/pages/Reports.tsx with a header, 
         sidebar navigation, and table showing recent activity. 
         Only Admin and SuperAdmin roles should access this page."

❌ BAD:  "Add a reports page"
```

### Style Changes
```
✅ GOOD: "Change the primary button color in tailwind.config.ts 
         from blue-600 to purple-600"

❌ BAD:  "Make buttons purple"
```

### Best Practices
1. **Be Specific**: Include file paths, component names, exact requirements
2. **Specify Roles**: Mention which user roles can access features
3. **Use Plan Mode**: For complex changes, ask Lovable to create a plan first
4. **Break It Down**: Split large features into smaller, focused prompts
5. **Provide Context**: Reference existing patterns in the codebase

## 🏗️ Project Structure

```
book-explorer/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # shadcn/ui components
│   │   ├── layout/      # Layout components (Header, Sidebar)
│   │   ├── dev/         # Developer tools
│   │   ├── analytics/   # Financial analytics components
│   │   └── ...          # Feature-specific components
│   ├── pages/           # Route-level pages
│   │   ├── financial/   # Financial suite pages
│   │   ├── hrms/        # HR management pages
│   │   └── performance/ # Performance management pages
│   ├── contexts/        # React contexts (Auth, Theme, etc.)
│   ├── hooks/           # Custom React hooks
│   ├── integrations/    # External service integrations
│   ├── lib/             # Utilities and helpers
│   └── config/          # Configuration files
├── supabase/            # Database migrations and functions
├── public/              # Static assets
└── templates/           # CSV templates for bulk uploads
```

## 🎨 Styling

### Tailwind CSS
- Configuration: `tailwind.config.ts`
- Main CSS: `src/index.css`
- Theme: Dark mode default, customizable

### shadcn/ui Components
- Config: `components.json`
- Import from: `@/components/ui/*`
- Docs: https://ui.shadcn.com

### Common Patterns
```tsx
// Button with variant
<Button variant="default" size="lg">Click me</Button>

// Card layout
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>

// Form with validation
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
```

## 🔐 Authentication & Authorization

### Current Setup
- **Auth Provider**: Supabase Auth
- **RBAC**: Role-Based Access Control with 5 roles
  - SuperAdmin (full access)
  - Admin (management access)
  - Moderator (limited management)
  - Author (content creation)
  - Reader (view only)

### Protected Routes
```tsx
<Route 
  path="/financial/accounting" 
  element={<ProtectedRoute><Accounting /></ProtectedRoute>} 
/>
```

### Checking Permissions in Components
```tsx
import { useAuth } from "@/contexts/AuthContext";

const MyComponent = () => {
  const { user, hasRole } = useAuth();
  
  if (hasRole('Admin')) {
    // Admin-only features
  }
};
```

## 📊 Data Management

### Supabase Integration
- Client: `@/integrations/supabase/client`
- Types: Auto-generated in `@/integrations/supabase/types`

### React Query
```tsx
import { useQuery } from "@tanstack/react-query";

const { data, isLoading } = useQuery({
  queryKey: ['items'],
  queryFn: async () => {
    // Fetch data from Supabase
  }
});
```

## 🛠️ Development

### Local Development
```bash
npm install
npm run dev
```

### Building
```bash
npm run build      # Production build
npm run preview    # Preview production build
```

### Testing
```bash
npm test           # Run tests
npm run test:watch # Watch mode
```

### Linting
```bash
npm run lint       # Run ESLint
```

## 🚢 Deployment

### Via Lovable (Recommended)
1. Open your project in Lovable
2. Click "Share" → "Publish"
3. Your app is live!

### Via External Platform
The built files in `dist/` can be deployed to:
- Vercel
- Netlify
- Any static hosting service

## 🔍 Common Tasks

### Adding a New Page
1. Create file in `src/pages/`
2. Add route in `src/App.tsx`
3. Add menu item in `src/components/layout/Sidebar.tsx`

### Adding a New Component
1. Create file in appropriate `src/components/` subfolder
2. Export component as default
3. Import and use in pages

### Adding New Dependencies
```bash
npm install package-name
```

### Environment Variables
Create/edit `.env`:
```
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-key
VITE_DEV_MODE=true
```

## 📚 Key Documentation Files

- **LOVABLE_COMPATIBILITY.md** - Lovable platform compatibility guide
- **README.md** - Project overview and setup
- **DEVELOPMENT_SETUP.md** - Detailed development guide
- **RBAC_IMPLEMENTATION.md** - Role-based access control docs
- **BULK_UPLOAD_GUIDE.md** - Data import documentation
- **SEEDING_GUIDE.md** - Database seeding instructions

## 🎯 Module Overview

### Financial Suite
- Accounting: Chart of accounts, general ledger
- Invoicing: Invoice management
- Banking: Bank account reconciliation
- Cash Flow: Cash flow forecasting
- Analytics: Financial reports and dashboards

### HRMS
- Employees: Employee directory and profiles
- Attendance: Time tracking and attendance
- Leaves: Leave management
- Payroll: Salary processing

### Performance OS
- Goals: Goal setting and tracking
- Memos: Internal communications

## 🐛 Troubleshooting

### Build Errors
- Clear cache: `rm -rf node_modules package-lock.json && npm install`
- Check TypeScript: `npx tsc --noEmit`

### Dev Mode Not Working
- Check `.env` has `VITE_DEV_MODE=true`
- Verify Supabase credentials
- Look for errors in browser console

### Components Not Rendering
- Check import paths use `@/` alias
- Verify component is exported properly
- Check for console errors

## 💡 Pro Tips

1. **Use Plan Mode First**: For complex features, ask Lovable to plan before coding
2. **Component Library**: Leverage shadcn/ui components - they're pre-styled
3. **TypeScript**: VS Code autocomplete works great with our setup
4. **Dev Tools**: Purple button on right side for RBAC testing
5. **Hot Reload**: Changes appear instantly during development

---

**Need Help?**
- Check documentation files in this repo
- Review existing code for patterns
- Use Lovable's AI with specific prompts

**Last Updated**: February 17, 2026
