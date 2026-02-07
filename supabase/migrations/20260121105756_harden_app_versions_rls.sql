
-- ============================================
-- RLS SECURITY HARDENING: app_versions
-- Remove write access for authenticated users
-- Only service_role can INSERT/UPDATE/DELETE
-- ============================================

-- Drop the dangerous policy that allows authenticated users to manage app_versions
DROP POLICY IF EXISTS "Allow authenticated users to manage app_versions" ON app_versions;

-- Keep the existing SELECT policy for public read access
-- "Allow public read access on app_versions" already exists and is safe
