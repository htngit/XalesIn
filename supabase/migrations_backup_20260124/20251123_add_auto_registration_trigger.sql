-- Migration: Add Auto-Registration Trigger
-- Description: Automatically creates profile, free subscription, and settings for new users
-- Author: System
-- Date: 2025-11-23

-- ============================================================================
-- FUNCTION: Handle New User Registration
-- ============================================================================
-- This function automatically creates:
-- 1. Profile (owner role)
-- 2. Free subscription (triggers quota creation)
-- 3. Default user settings
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER AS $$
BEGIN
  -- [1] Create user profile
  INSERT INTO public.profiles (
    id,
    email,
    name,
    role,
    master_user_id,
    is_active
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'owner',
    NEW.id,
    true
  ) ON CONFLICT (id) DO NOTHING;
  
  -- [2] Create FREE subscription
  -- This will automatically trigger sync_subscription_to_quota()
  -- which creates user_quotas with 5 messages limit
  INSERT INTO public.subscriptions (
    master_user_id,
    plan_type,
    billing_cycle,
    status,
    price,
    currency,
    valid_from,
    valid_until,
    quota_reset_date,
    auto_renew
  ) VALUES (
    NEW.id,
    'free',              -- FREE plan for all new users
    'monthly',
    'active',
    0,                   -- Free = Rp 0
    'IDR',
    NOW(),
    NOW() + INTERVAL '10 years', -- Free plan never expires
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    false                -- No auto-renewal for free
  ) ON CONFLICT (master_user_id) DO NOTHING;
  
  -- Note: user_quotas will be auto-created by subscription_changed trigger
  -- with plan_type='free' and messages_limit=5
  
  -- [3] Create default user settings
  INSERT INTO public.user_settings (
    user_id,
    language,
    timezone,
    theme,
    enable_push_notifications,
    enable_email_notifications
  ) VALUES (
    NEW.id,
    'id',                -- Default: Indonesian
    'Asia/Jakarta',
    'dark',
    true,
    false
  ) ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail user creation
  RAISE WARNING 'Error in handle_new_user_registration for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Auto-create on new user signup
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_registration();

-- ============================================================================
-- UPDATE RLS POLICIES: Allow service role to insert
-- ============================================================================

-- Profiles: Allow service role
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR auth.role() = 'service_role'
  );

-- Subscriptions: Allow service role
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (
    auth.uid() = master_user_id OR auth.role() = 'service_role'
  );

-- ============================================================================
-- ADD MISSING PRICING PLANS
-- ============================================================================

-- Insert Free and Basic plans (Pro already exists from previous migration)
INSERT INTO pricing_plans (plan_type, plan_name, billing_cycle, price, quota, features, is_active)
VALUES 
  -- Free Plan
  (
    'free',
    'Free',
    'monthly',
    0,
    5,
    '["5 messages per month", "Basic support", "Community access"]'::jsonb,
    true
  ),
  
  -- Basic Monthly
  (
    'basic',
    'Basic - Monthly',
    'monthly',
    25000,
    500,
    ["500 messages per month", "Email support", "Basic analytics", "Template library"]'::jsonb,
    true
  ),
  
  -- Basic Yearly (20% discount)
  (
    'basic',
    'Basic - Yearly',
    'yearly',
    240000,
    500,
    '["500 messages per month", "Email support", "Basic analytics", "Template library", "20% yearly discount"]'::jsonb,
    true
  )
ON CONFLICT (plan_name) DO UPDATE
SET 
  price = EXCLUDED.price,
  quota = EXCLUDED.quota,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify)
-- ============================================================================

-- Check if trigger exists
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check pricing plans
-- SELECT plan_type, plan_name, price, quota FROM pricing_plans ORDER BY price;

-- Test: Check what happens when a user registers
-- (After registration, check these tables)
-- SELECT * FROM profiles WHERE id = '<new_user_id>';
-- SELECT * FROM subscriptions WHERE master_user_id = '<new_user_id>';
-- SELECT * FROM user_quotas WHERE user_id = '<new_user_id>';
