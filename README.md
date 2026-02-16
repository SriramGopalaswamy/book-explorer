# Book Explorer - Enterprise Application

## Project Overview

Book Explorer is a full-stack enterprise application with comprehensive RBAC (Role-Based Access Control) system, demo mode, and developer tools for debugging and testing permissions.

## Developer Mode

This project includes a comprehensive RBAC introspection and governance layer for development and testing. See [DEVELOPER_MODE.md](./DEVELOPER_MODE.md) for complete documentation.

**Quick Start:**
- Dev mode is enabled by default in development
- Access the dev toolbar from the purple button on the right side of the screen
- Switch roles at runtime to test different permission levels
- View permission matrices and debug access control

## Environment Variables

### Backend (.env)

```bash
# Session secret (required for production)
SESSION_SECRET=your-secret-key-here

# Database (defaults to SQLite in dev, PostgreSQL in production)
DATABASE_URL=your-database-url

# Developer mode (default: true in development, false in production)
DEV_MODE=true
ALLOW_PERMISSION_EDITING=true

# Demo mode (disables mutations)
DEMO_MODE=false
```

### Frontend (.env)

```bash
# Supabase configuration
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-key

# Backend API URL
VITE_API_URL=http://localhost:3000/api

# Developer mode
VITE_DEV_MODE=true
VITE_ALLOW_PERMISSION_EDITING=true
```

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
