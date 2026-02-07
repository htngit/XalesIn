-- Migration: Update Registration Function to Create FREE Subscription
-- Replace old handle_new_user() that creates basic quota directly
-- New version creates FREE subscription which auto-syncs to user_quotas

CREATE OR REPLACE FUNCTION public.handle_new_user()
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
  RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
