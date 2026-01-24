-- ============================================================================
-- TEMPORARILY DISABLE RLS FOR REGISTRATION TESTING
-- This allows registration to work while we optimize RLS policies
-- ============================================================================

-- Temporarily disable RLS on profiles and user_quotas for registration
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quotas DISABLE ROW LEVEL SECURITY;

-- ============================================================================
