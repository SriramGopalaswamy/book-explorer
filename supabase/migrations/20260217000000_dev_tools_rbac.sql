-- =====================================================
-- DEV TOOLS RBAC TABLES
-- =====================================================
-- This migration adds the necessary tables for dev tools
-- to function without the Express backend.
-- It creates a comprehensive RBAC system with:
-- - roles (with priorities and metadata)
-- - permissions (granular permission definitions)
-- - role_permissions (many-to-many junction table)

-- 1. Create roles table
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  priority integer NOT NULL DEFAULT 0,
  is_system_role boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  permission_string text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (module, resource, action)
);

-- 3. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow anyone to read (needed for dev tools)
-- In production, dev tools won't be accessible anyway
CREATE POLICY "Allow read access to roles"
  ON public.roles FOR SELECT
  USING (true);

CREATE POLICY "Allow read access to permissions"
  ON public.permissions FOR SELECT
  USING (true);

CREATE POLICY "Allow read access to role_permissions"
  ON public.role_permissions FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert roles"
  ON public.roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert permissions"
  ON public.permissions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update permissions"
  ON public.permissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete permissions"
  ON public.permissions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert role_permissions"
  ON public.role_permissions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update role_permissions"
  ON public.role_permissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete role_permissions"
  ON public.role_permissions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_priority ON public.roles(priority DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON public.permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_permission_string ON public.permissions(permission_string);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial roles
INSERT INTO public.roles (name, description, priority, is_system_role) VALUES
  ('SuperAdmin', 'Full system access with all permissions', 100, true),
  ('Admin', 'Administrative access to most features', 90, true),
  ('Moderator', 'Content moderation capabilities', 50, true),
  ('Author', 'Can create and manage own content', 40, true),
  ('Reader', 'Basic read access', 10, true)
ON CONFLICT (name) DO NOTHING;

-- Seed initial permissions
INSERT INTO public.permissions (module, resource, action, permission_string, description) VALUES
  -- Books module
  ('books', 'book', 'create', 'books.book.create', 'Create new books'),
  ('books', 'book', 'read', 'books.book.read', 'Read books'),
  ('books', 'book', 'update', 'books.book.update', 'Update existing books'),
  ('books', 'book', 'delete', 'books.book.delete', 'Delete books'),
  ('books', 'book', 'publish', 'books.book.publish', 'Publish books'),
  
  -- Reviews module
  ('reviews', 'review', 'create', 'reviews.review.create', 'Create reviews'),
  ('reviews', 'review', 'read', 'reviews.review.read', 'Read reviews'),
  ('reviews', 'review', 'update', 'reviews.review.update', 'Update reviews'),
  ('reviews', 'review', 'delete', 'reviews.review.delete', 'Delete reviews'),
  ('reviews', 'review', 'moderate', 'reviews.review.moderate', 'Moderate reviews'),
  
  -- Users module
  ('users', 'user', 'create', 'users.user.create', 'Create users'),
  ('users', 'user', 'read', 'users.user.read', 'Read user information'),
  ('users', 'user', 'update', 'users.user.update', 'Update user information'),
  ('users', 'user', 'delete', 'users.user.delete', 'Delete users'),
  
  -- Security module
  ('security', 'role', 'manage', 'security.role.manage', 'Manage roles and permissions'),
  ('security', 'permission', 'manage', 'security.permission.manage', 'Manage permissions'),
  
  -- Wildcard permission (SuperAdmin only)
  ('*', '*', '*', '*', 'Full system access')
ON CONFLICT (permission_string) DO NOTHING;

-- Assign permissions to roles
DO $$
DECLARE
  superadmin_id uuid;
  admin_id uuid;
  moderator_id uuid;
  author_id uuid;
  reader_id uuid;
  wildcard_perm_id uuid;
BEGIN
  -- Get role IDs
  SELECT id INTO superadmin_id FROM public.roles WHERE name = 'SuperAdmin';
  SELECT id INTO admin_id FROM public.roles WHERE name = 'Admin';
  SELECT id INTO moderator_id FROM public.roles WHERE name = 'Moderator';
  SELECT id INTO author_id FROM public.roles WHERE name = 'Author';
  SELECT id INTO reader_id FROM public.roles WHERE name = 'Reader';
  
  -- Get wildcard permission ID
  SELECT id INTO wildcard_perm_id FROM public.permissions WHERE permission_string = '*';
  
  -- SuperAdmin gets wildcard permission
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT superadmin_id, wildcard_perm_id
  WHERE superadmin_id IS NOT NULL AND wildcard_perm_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  
  -- Admin gets all permissions except wildcard
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT admin_id, id
  FROM public.permissions
  WHERE permission_string != '*' AND admin_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  
  -- Moderator gets read and moderate permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT moderator_id, id
  FROM public.permissions
  WHERE permission_string IN (
    'books.book.read',
    'reviews.review.read',
    'reviews.review.moderate',
    'reviews.review.delete',
    'users.user.read'
  ) AND moderator_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  
  -- Author gets create/read/update for books and reviews
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT author_id, id
  FROM public.permissions
  WHERE permission_string IN (
    'books.book.create',
    'books.book.read',
    'books.book.update',
    'reviews.review.create',
    'reviews.review.read',
    'reviews.review.update'
  ) AND author_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  
  -- Reader gets only read permissions
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT reader_id, id
  FROM public.permissions
  WHERE permission_string IN (
    'books.book.read',
    'reviews.review.read'
  ) AND reader_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END $$;

-- Create RPC function to update role permissions
CREATE OR REPLACE FUNCTION public.update_role_permissions(
  role_name text,
  permission_strings text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_role_id uuid;
  perm_id uuid;
  perm_string text;
  result json;
BEGIN
  -- Check if user has admin role
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update role permissions';
  END IF;
  
  -- Get role ID
  SELECT id INTO target_role_id FROM public.roles WHERE name = role_name;
  
  IF target_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found', role_name;
  END IF;
  
  -- Delete existing permissions for this role
  DELETE FROM public.role_permissions WHERE role_id = target_role_id;
  
  -- Insert new permissions
  FOREACH perm_string IN ARRAY permission_strings
  LOOP
    SELECT id INTO perm_id FROM public.permissions WHERE permission_string = perm_string;
    
    IF perm_id IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (target_role_id, perm_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Return success result
  result := json_build_object(
    'success', true,
    'message', 'Permissions updated successfully',
    'role', role_name,
    'permissions_count', array_length(permission_strings, 1)
  );
  
  RETURN result;
END;
$$;
