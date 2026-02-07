-- ============================================================================
-- COMPLETE SCHEMA MIGRATION - FIXED VERSION
-- Date: 2024
-- Description: Complete database schema with all tables, RLS, triggers, and functions
-- Fixed: Table mappings, field names, and missing tables
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')) DEFAULT 'staff',
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User quotas table (NOTE: table name is 'user_quotas', NOT 'quotas')
CREATE TABLE public.user_quotas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'premium', 'enterprise')) DEFAULT 'basic',
    messages_limit INTEGER NOT NULL,
    messages_used INTEGER DEFAULT 0,
    reset_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quota reservations table (for avoiding race conditions)
CREATE TABLE public.quota_reservations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT CHECK (status IN ('pending', 'committed', 'expired', 'rolled_back')) DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions table (for multi-device tracking)
CREATE TABLE public.user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_info JSONB,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'IDR',
    status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    method TEXT,
    transaction_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- APP DATA TABLES
-- ============================================================================

-- Contacts table
CREATE TABLE public.contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    phone_number TEXT NOT NULL,
    name TEXT,
    is_verified BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(master_user_id, phone_number)
);

-- Contact Groups table (NOTE: table name is 'groups', NOT 'contact_groups')
CREATE TABLE public.groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    contact_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Members (Junction table for Contact <-> Group)
CREATE TABLE public.group_members (
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, contact_id)
);

-- Templates table
CREATE TABLE public.templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT CHECK (type IN ('text', 'image', 'video', 'document', 'interactive')) DEFAULT 'text',
    category TEXT,
    status TEXT CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template Variants (for A/B testing or language variations)
CREATE TABLE public.template_variants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'id',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table (for media files)
CREATE TABLE public.assets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT,
    size INTEGER,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- History/Activity Logs table (NOTE: table name is 'history', NOT 'activityLogs')
CREATE TABLE public.history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    status TEXT CHECK (status IN ('success', 'failed', 'pending')) DEFAULT 'success',
    ip_address TEXT,
    user_agent TEXT,
    template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
    recipient_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR auth.uid() = master_user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Quota Policies
CREATE POLICY "Users can view own quota" ON public.user_quotas
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = master_user_id);

-- Contacts Policies
CREATE POLICY "Users can view own contacts" ON public.contacts
    FOR SELECT USING (auth.uid() = master_user_id);
CREATE POLICY "Users can insert own contacts" ON public.contacts
    FOR INSERT WITH CHECK (auth.uid() = master_user_id);
CREATE POLICY "Users can update own contacts" ON public.contacts
    FOR UPDATE USING (auth.uid() = master_user_id);
CREATE POLICY "Users can delete own contacts" ON public.contacts
    FOR DELETE USING (auth.uid() = master_user_id);

-- Groups Policies
CREATE POLICY "Users can view own groups" ON public.groups
    FOR SELECT USING (auth.uid() = master_user_id);
CREATE POLICY "Users can insert own groups" ON public.groups
    FOR INSERT WITH CHECK (auth.uid() = master_user_id);
CREATE POLICY "Users can update own groups" ON public.groups
    FOR UPDATE USING (auth.uid() = master_user_id);
CREATE POLICY "Users can delete own groups" ON public.groups
    FOR DELETE USING (auth.uid() = master_user_id);

-- Templates Policies
CREATE POLICY "Users can view own templates" ON public.templates
    FOR SELECT USING (auth.uid() = master_user_id);
CREATE POLICY "Users can insert own templates" ON public.templates
    FOR INSERT WITH CHECK (auth.uid() = master_user_id);
CREATE POLICY "Users can update own templates" ON public.templates
    FOR UPDATE USING (auth.uid() = master_user_id);
CREATE POLICY "Users can delete own templates" ON public.templates
    FOR DELETE USING (auth.uid() = master_user_id);

-- History Policies
CREATE POLICY "Users can view own history" ON public.history
    FOR SELECT USING (auth.uid() = master_user_id);
CREATE POLICY "Users can insert into history" ON public.history
    FOR INSERT WITH CHECK (auth.uid() = master_user_id);

-- Assets Policies
CREATE POLICY "Users can view own assets" ON public.assets
    FOR SELECT USING (auth.uid() = master_user_id);
CREATE POLICY "Users can insert own assets" ON public.assets
    FOR INSERT WITH CHECK (auth.uid() = master_user_id);
CREATE POLICY "Users can delete own assets" ON public.assets
    FOR DELETE USING (auth.uid() = master_user_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, master_user_id)
    VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), 'staff', NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to initialize user quota
CREATE OR REPLACE FUNCTION public.initialize_user_quota()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_quotas (
        user_id, master_user_id, plan_type, messages_limit, reset_date
    )
    VALUES (
        NEW.id, NEW.id, 'basic', 1000, NOW() + INTERVAL '1 month'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for initializing quota
CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.initialize_user_quota();

-- Function to check quota usage
CREATE OR REPLACE FUNCTION check_quota_usage(p_user_id UUID)
RETURNS TABLE (
    quota_id UUID,
    plan_type TEXT,
    messages_limit INTEGER,
    messages_used INTEGER,
    messages_remaining INTEGER,
    reset_date TIMESTAMPTZ,
    master_user_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uq.id,
        uq.plan_type,
        uq.messages_limit,
        uq.messages_used,
        (uq.messages_limit - uq.messages_used) as messages_remaining,
        uq.reset_date,
        uq.master_user_id
    FROM public.user_quotas uq
    WHERE uq.user_id = p_user_id
    AND uq.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reserve quota (prevents race conditions)
CREATE OR REPLACE FUNCTION reserve_quota(p_user_id UUID, p_amount INTEGER)
RETURNS TABLE (success BOOLEAN, reservation_id UUID, messages_remaining INTEGER, error_message TEXT) AS $$
DECLARE
    v_quota_id UUID;
    v_current_usage INTEGER;
    v_limit INTEGER;
    v_reservation_id UUID;
BEGIN
    -- Get current quota info with row lock
    SELECT id, messages_used, messages_limit 
    INTO v_quota_id, v_current_usage, v_limit
    FROM public.user_quotas
    WHERE user_id = p_user_id AND is_active = true
    FOR UPDATE;

    IF v_quota_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 0, 'Quota not found';
        RETURN;
    END IF;

    -- Check if enough quota
    IF (v_current_usage + p_amount) > v_limit THEN
        RETURN QUERY SELECT false, NULL::UUID, (v_limit - v_current_usage), 'Insufficient quota';
        RETURN;
    END IF;

    -- Create reservation
    INSERT INTO public.quota_reservations (user_id, amount, status, expires_at)
    VALUES (p_user_id, p_amount, 'pending', NOW() + INTERVAL '5 minutes')
    RETURNING id INTO v_reservation_id;

    RETURN QUERY SELECT true, v_reservation_id, (v_limit - (v_current_usage + p_amount)), NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to commit quota usage
CREATE OR REPLACE FUNCTION commit_quota_usage(p_reservation_id UUID, p_success_count INTEGER)
RETURNS TABLE (success BOOLEAN, messages_remaining INTEGER, error_message TEXT) AS $$
DECLARE
    v_reservation record;
    v_quota record;
BEGIN
    -- Get reservation
    SELECT * INTO v_reservation 
    FROM public.quota_reservations 
    WHERE id = p_reservation_id AND status = 'pending'
    FOR UPDATE;

    IF v_reservation IS NULL THEN
        RETURN QUERY SELECT false, 0, 'Reservation not found or expired';
        RETURN;
    END IF;

    -- Update quota
    UPDATE public.user_quotas
    SET messages_used = messages_used + p_success_count,
        updated_at = NOW()
    WHERE user_id = v_reservation.user_id
    RETURNING messages_limit, messages_used INTO v_quota;

    -- Update reservation status
    UPDATE public.quota_reservations
    SET status = 'committed',
        updated_at = NOW()
    WHERE id = p_reservation_id;

    RETURN QUERY SELECT true, (v_quota.messages_limit - v_quota.messages_used), NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track template usage
CREATE OR REPLACE FUNCTION increment_template_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.template_id IS NOT NULL THEN
        UPDATE public.templates 
        SET usage_count = usage_count + 1,
            updated_at = NOW()
        WHERE id = NEW.template_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track template usage
CREATE TRIGGER increment_template_usage_trigger
    AFTER INSERT ON public.history
    FOR EACH ROW EXECUTE FUNCTION increment_template_usage();

-- Function to cleanup expired quota reservations
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS void AS $$
BEGIN
    UPDATE public.quota_reservations
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NOTES FOR DEVELOPERS
-- ============================================================================

-- Table Name Mappings (for sync):
-- Local DB Name       -> Supabase Table Name
-- contacts            -> contacts
-- groups              -> groups (NOT contact_groups!)
-- templates           -> templates
-- activityLogs        -> history
-- assets              -> assets
-- quotas              -> user_quotas (NOT quotas!)
-- profiles            -> profiles
-- payments            -> payments
-- quotaReservations   -> quota_reservations
-- userSessions        -> user_sessions

-- IMPORTANT: AuthService manually creates profiles and quotas
-- NO automatic trigger on auth.users insert to avoid duplicates
-- Application code has full control over profile/quota creation
