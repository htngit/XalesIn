-- Fix search_path for handle_updated_at (User reported)
ALTER FUNCTION public.handle_updated_at() SET search_path = public;

-- Fix search_path for handle_new_user (Critical Security Definer)
ALTER FUNCTION public.handle_new_user() SET search_path = public;
