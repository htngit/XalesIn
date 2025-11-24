-- Migration: Move profile/quota creation from signup to email confirmation
-- This prevents race conditions and ensures only verified users have database records

-- Step 1: Drop existing trigger on INSERT
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Create new function for email confirmation event
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only proceed if email is being confirmed (not already confirmed)
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    
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
      updated_at = NOW();
    
    -- [2] Create FREE subscription (with ON CONFLICT)
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
      updated_at = NOW();
    
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
      updated_at = NOW();
    
    RAISE LOG 'Profile, subscription, and settings created for confirmed user: %', NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail email confirmation
  RAISE WARNING 'Error in handle_user_email_confirmed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger on UPDATE for email confirmation
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL)
  EXECUTE FUNCTION public.handle_user_email_confirmed();

-- Step 4: Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_user_email_confirmed() TO postgres, service_role;

-- Note: Existing users who already have confirmed emails won't be affected
-- Only new email confirmations will trigger profile creation
