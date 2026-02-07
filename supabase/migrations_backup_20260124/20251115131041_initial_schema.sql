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
    messages_limit INTEGER NOT NULL DEFAULT 1000,
    messages_used INTEGER NOT NULL DEFAULT 0,
    reset_date DATE NOT NULL DEFAULT CURRENT_DATE + INTERVAL '1 month',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, master_user_id)
);

-- Payments table
CREATE TABLE public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    payment_id TEXT UNIQUE NOT NULL,
    duitku_transaction_id TEXT,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'premium', 'enterprise')),
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'IDR',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'expired')) DEFAULT 'pending',
    payment_method TEXT,
    qr_url TEXT,
    payment_url TEXT,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact groups table (NOTE: table name is 'groups', NOT 'contact_groups')
CREATE TABLE public.groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    contact_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts table
CREATE TABLE public.contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tags TEXT[],
    notes TEXT,
    is_blocked BOOLEAN DEFAULT false,
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone, master_user_id)
);

-- Templates table
CREATE TABLE public.templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT,  -- Made nullable since we use variants
    variants TEXT[],  -- Array of template variants
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    attachment_url TEXT,
    variables TEXT[],
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table
CREATE TABLE public.assets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('image', 'video', 'audio', 'document', 'other')) DEFAULT 'other',
    mime_type TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- History/Activity logs table (NOTE: table name is 'history', mapped from 'activityLogs')
CREATE TABLE public.history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    contact_group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE,
    template_name TEXT,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
    delay_range INTEGER DEFAULT 30,
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quota Reservations table (NEW - for offline quota management)
CREATE TABLE public.quota_reservations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    quota_id UUID REFERENCES public.user_quotas(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'cancelled', 'expired')) DEFAULT 'pending',
    expires_at TIMESTAMPTZ,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Sessions table (NEW - for offline auth tracking)
CREATE TABLE public.user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    master_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    ip_address TEXT,
    user_agent TEXT
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Profiles indexes
CREATE INDEX idx_profiles_master_user_id ON public.profiles(master_user_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- User quotas indexes
CREATE INDEX idx_user_quotas_user_id ON public.user_quotas(user_id);
CREATE INDEX idx_user_quotas_master_user_id ON public.user_quotas(master_user_id);
CREATE INDEX idx_user_quotas_reset_date ON public.user_quotas(reset_date);
CREATE INDEX idx_user_quotas_is_active ON public.user_quotas(is_active);

-- Payments indexes
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_master_user_id ON public.payments(master_user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_payment_id ON public.payments(payment_id);

-- Groups indexes
CREATE INDEX idx_groups_master_user_id ON public.groups(master_user_id);
CREATE INDEX idx_groups_created_by ON public.groups(created_by);
CREATE INDEX idx_groups_is_active ON public.groups(is_active);

-- Contacts indexes
CREATE INDEX idx_contacts_group_id ON public.contacts(group_id);
CREATE INDEX idx_contacts_master_user_id ON public.contacts(master_user_id);
CREATE INDEX idx_contacts_created_by ON public.contacts(created_by);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_is_blocked ON public.contacts(is_blocked);

-- Templates indexes
CREATE INDEX idx_templates_master_user_id ON public.templates(master_user_id);
CREATE INDEX idx_templates_created_by ON public.templates(created_by);
CREATE INDEX idx_templates_category ON public.templates(category);
CREATE INDEX idx_templates_is_active ON public.templates(is_active);

-- Assets indexes
CREATE INDEX idx_assets_master_user_id ON public.assets(master_user_id);
CREATE INDEX idx_assets_uploaded_by ON public.assets(uploaded_by);
CREATE INDEX idx_assets_category ON public.assets(category);

-- History indexes
CREATE INDEX idx_history_user_id ON public.history(user_id);
CREATE INDEX idx_history_master_user_id ON public.history(master_user_id);
CREATE INDEX idx_history_status ON public.history(status);
CREATE INDEX idx_history_created_at ON public.history(created_at);

-- Quota Reservations indexes
CREATE INDEX idx_quota_reservations_user_id ON public.quota_reservations(user_id);
CREATE INDEX idx_quota_reservations_master_user_id ON public.quota_reservations(master_user_id);
CREATE INDEX idx_quota_reservations_quota_id ON public.quota_reservations(quota_id);
CREATE INDEX idx_quota_reservations_status ON public.quota_reservations(status);
CREATE INDEX idx_quota_reservations_expires_at ON public.quota_reservations(expires_at);

-- User Sessions indexes
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_master_user_id ON public.user_sessions(master_user_id);
CREATE INDEX idx_user_sessions_session_token ON public.user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX idx_user_sessions_is_active ON public.user_sessions(is_active);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR auth.uid() = master_user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR auth.uid() = master_user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- User quotas policies
CREATE POLICY "Users can view their own quota" ON public.user_quotas
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Users can insert their own quota" ON public.user_quotas
    FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Service role can manage quotas" ON public.user_quotas
    FOR ALL USING (auth.role() = 'service_role');

-- Payments policies
CREATE POLICY "Users can view their own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Users can insert their own payments" ON public.payments
    FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Service role can update payments" ON public.payments
    FOR UPDATE USING (auth.role() = 'service_role');

-- Groups policies
CREATE POLICY "Users can view groups from their master account" ON public.groups
    FOR SELECT USING (auth.uid() = master_user_id OR auth.uid() = created_by);

CREATE POLICY "Users can manage groups in their master account" ON public.groups
    FOR ALL USING (auth.uid() = master_user_id OR auth.uid() = created_by);

-- Contacts policies
CREATE POLICY "Users can view contacts from their master account" ON public.contacts
    FOR SELECT USING (auth.uid() = master_user_id OR auth.uid() = created_by);

CREATE POLICY "Users can manage contacts in their master account" ON public.contacts
    FOR ALL USING (auth.uid() = master_user_id OR auth.uid() = created_by);

-- Templates policies
CREATE POLICY "Users can view templates from their master account" ON public.templates
    FOR SELECT USING (auth.uid() = master_user_id OR auth.uid() = created_by);

CREATE POLICY "Users can manage templates in their master account" ON public.templates
    FOR ALL USING (auth.uid() = master_user_id OR auth.uid() = created_by);

-- Assets policies
CREATE POLICY "Users can view assets from their master account" ON public.assets
    FOR SELECT USING (auth.uid() = master_user_id OR auth.uid() = uploaded_by);

CREATE POLICY "Users can manage assets in their master account" ON public.assets
    FOR ALL USING (auth.uid() = master_user_id OR auth.uid() = uploaded_by);

-- History policies
CREATE POLICY "Users can view history from their master account" ON public.history
    FOR SELECT USING (auth.uid() = master_user_id OR auth.uid() = user_id);

CREATE POLICY "Users can create history in their master account" ON public.history
    FOR INSERT WITH CHECK (auth.uid() = master_user_id OR auth.uid() = user_id);

CREATE POLICY "Users can update their own history" ON public.history
    FOR UPDATE USING (auth.uid() = master_user_id OR auth.uid() = user_id);

-- Quota Reservations policies
CREATE POLICY "Users can view their own reservations" ON public.quota_reservations
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Users can manage their own reservations" ON public.quota_reservations
    FOR ALL USING (auth.uid() = user_id OR auth.uid() = master_user_id);

-- User Sessions policies
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = master_user_id);

CREATE POLICY "Users can manage their own sessions" ON public.user_sessions
    FOR ALL USING (auth.uid() = user_id OR auth.uid() = master_user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RPC FUNCTIONS FOR QUOTA MANAGEMENT
-- ============================================================================

-- Function to check quota usage (returns all needed fields)
CREATE OR REPLACE FUNCTION public.check_quota_usage(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    master_user_id UUID,
    quota_id UUID,
    messages_remaining INTEGER,
    messages_limit INTEGER,
    messages_used INTEGER,
    plan_type TEXT,
    reset_date DATE,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uq.id,
        uq.user_id,
        uq.master_user_id,
        uq.id as quota_id,
        uq.messages_limit - uq.messages_used as messages_remaining,
        uq.messages_limit,
        uq.messages_used,
        uq.plan_type,
        uq.reset_date,
        uq.is_active
    FROM public.user_quotas uq
    WHERE uq.user_id = p_user_id 
    AND uq.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reserve quota (optimistic locking)
CREATE OR REPLACE FUNCTION public.reserve_quota(p_user_id UUID, p_amount INTEGER)
RETURNS TABLE (
    success BOOLEAN,
    quota_id UUID,
    messages_remaining INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_quota_id UUID;
    v_current_used INTEGER;
    v_limit INTEGER;
    v_master_user_id UUID;
BEGIN
    -- Get current quota info with row lock
    SELECT uq.id, uq.messages_used, uq.messages_limit, uq.master_user_id
    INTO v_quota_id, v_current_used, v_limit, v_master_user_id
    FROM public.user_quotas uq
    WHERE uq.user_id = p_user_id 
    AND uq.is_active = true
    FOR UPDATE;
    
    -- Check if quota exists
    IF v_quota_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 0, 'No active quota found for user';
        RETURN;
    END IF;
    
    -- Check if enough quota available
    IF (v_current_used + p_amount) > v_limit THEN
        RETURN QUERY SELECT false, v_quota_id, v_limit - v_current_used, 'Insufficient quota';
        RETURN;
    END IF;
    
    -- Create reservation record
    INSERT INTO public.quota_reservations (user_id, master_user_id, quota_id, amount, status, expires_at)
    VALUES (p_user_id, v_master_user_id, v_quota_id, p_amount, 'pending', NOW() + INTERVAL '1 hour');
    
    -- Return success
    RETURN QUERY SELECT true, v_quota_id, v_limit - v_current_used - p_amount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to commit quota usage
CREATE OR REPLACE FUNCTION public.commit_quota_usage(p_reservation_id UUID, p_success_count INTEGER)
RETURNS TABLE (
    success BOOLEAN,
    messages_remaining INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_quota_id UUID;
    v_user_id UUID;
    v_amount INTEGER;
    v_limit INTEGER;
    v_current_used INTEGER;
BEGIN
    -- Get reservation info
    SELECT quota_id, user_id, amount
    INTO v_quota_id, v_user_id, v_amount
    FROM public.quota_reservations
    WHERE id = p_reservation_id
    AND status = 'pending';
    
    IF v_quota_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 'Reservation not found or already processed';
        RETURN;
    END IF;
    
    -- Update quota usage
    UPDATE public.user_quotas
    SET messages_used = messages_used + p_success_count,
        updated_at = NOW()
    WHERE id = v_quota_id
    RETURNING messages_limit, messages_used INTO v_limit, v_current_used;
    
    -- Mark reservation as committed
    UPDATE public.quota_reservations
    SET status = 'committed',
        committed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_reservation_id;
    
    -- Return success with remaining quota
    RETURN QUERY SELECT true, v_limit - v_current_used, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel/release quota reservation
CREATE OR REPLACE FUNCTION public.release_quota_reservation(p_reservation_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
BEGIN
    -- Update reservation status to cancelled
    UPDATE public.quota_reservations
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_reservation_id
    AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Reservation not found or already processed';
        RETURN;
    END IF;
    
    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's activity statistics
CREATE OR REPLACE FUNCTION public.get_user_activity_stats(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    total_campaigns INTEGER,
    total_contacts_reached INTEGER,
    success_rate NUMERIC,
    total_messages_sent INTEGER,
    active_templates INTEGER,
    active_groups INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT h.id)::INTEGER as total_campaigns,
        COALESCE(SUM(h.total_contacts), 0)::INTEGER as total_contacts_reached,
        CASE 
            WHEN SUM(h.total_contacts) > 0 THEN 
                ROUND((SUM(h.success_count)::NUMERIC / SUM(h.total_contacts)::NUMERIC) * 100, 2)
            ELSE 0
        END as success_rate,
        COALESCE(SUM(h.success_count), 0)::INTEGER as total_messages_sent,
        COUNT(DISTINCT t.id)::INTEGER as active_templates,
        COUNT(DISTINCT g.id)::INTEGER as active_groups
    FROM public.history h
    LEFT JOIN public.templates t ON t.created_by = p_user_id AND t.is_active = true
    LEFT JOIN public.groups g ON g.created_by = p_user_id AND g.is_active = true
    WHERE h.user_id = p_user_id
    AND h.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Triggers for updated_at timestamp
CREATE TRIGGER handle_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_user_quotas_updated_at
    BEFORE UPDATE ON public.user_quotas
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_templates_updated_at
    BEFORE UPDATE ON public.templates
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_assets_updated_at
    BEFORE UPDATE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_history_updated_at
    BEFORE UPDATE ON public.history
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_quota_reservations_updated_at
    BEFORE UPDATE ON public.quota_reservations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_user_sessions_updated_at
    BEFORE UPDATE ON public.user_sessions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to automatically update contact count when contacts are added/removed
CREATE OR REPLACE FUNCTION update_group_contact_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.groups 
        SET contact_count = contact_count + 1 
        WHERE id = NEW.group_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.groups 
        SET contact_count = contact_count - 1 
        WHERE id = OLD.group_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.group_id != NEW.group_id THEN
            UPDATE public.groups SET contact_count = contact_count - 1 WHERE id = OLD.group_id;
            UPDATE public.groups SET contact_count = contact_count + 1 WHERE id = NEW.group_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update contact count
CREATE TRIGGER update_group_contact_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION update_group_contact_count();

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
