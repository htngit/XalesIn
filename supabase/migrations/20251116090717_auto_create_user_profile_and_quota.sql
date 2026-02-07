-- ============================================================================
-- AUTO CREATE USER PROFILE AND QUOTA TRIGGERS
-- Date: 2025-11-16
-- Description: Add database triggers to automatically create profiles and quotas
-- when users sign up, eliminating timeout issues during registration
-- ============================================================================

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile record
    INSERT INTO public.profiles (id, email, name, role, master_user_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        'owner',
        NEW.id
    );

    -- Create default quota record
    INSERT INTO public.user_quotas (
        user_id,
        master_user_id,
        plan_type,
        messages_limit,
        messages_used,
        reset_date,
        is_active
    )
    VALUES (
        NEW.id,
        NEW.id,
        'basic',
        100,
        0,
        CURRENT_DATE + INTERVAL '1 month',
        true
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- UPDATE NOTES
-- ============================================================================

-- This migration adds automatic profile and quota creation
-- Registration process now only needs auth signup - database handles the rest
-- This eliminates the 504 timeout issues during registration
