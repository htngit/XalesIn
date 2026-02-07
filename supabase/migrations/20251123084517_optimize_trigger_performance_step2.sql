-- Migration: Optimize Trigger Performance (Step 2 of 2)
-- Purpose: Add ON CONFLICT checks to prevent constraint violations and retries
-- Expected: Faster user creation flow

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- [1] Create user profile (with ON CONFLICT for idempotency)
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
  ) ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();  -- Just update timestamp if exists
  
  -- [2] Create FREE subscription (with ON CONFLICT)
  -- This will automatically trigger sync_subscription_to_quota()
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
    'free',
    'monthly',
    'active',
    0,
    'IDR',
    NOW(),
    NOW() + INTERVAL '10 years',
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    false
  ) ON CONFLICT (master_user_id) DO UPDATE SET
    updated_at = NOW();  -- Just update timestamp if exists
  
  -- [3] Create default user settings (with ON CONFLICT)
  INSERT INTO public.user_settings (
    user_id,
    language,
    timezone,
    theme,
    enable_push_notifications,
    enable_email_notifications
  ) VALUES (
    NEW.id,
    'id',
    'Asia/Jakarta',
    'dark',
    true,
    false
  ) ON CONFLICT (user_id) DO UPDATE SET
    updated_at = NOW();  -- Just update timestamp if exists
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail user creation
  -- This prevents signup failure if trigger has issues
  RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
