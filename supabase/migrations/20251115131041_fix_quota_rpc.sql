-- ============================================================================
-- QUOTA RPC FUNCTIONS - FIXED VERSION
-- Date: 2024
-- Description: Enhanced RPC functions for quota management
-- Fixed: Return correct fields, proper error handling
-- ============================================================================

-- Drop existing function if exists (to allow recreation)
DROP FUNCTION IF EXISTS public.check_quota_usage(UUID);

-- Enhanced function to check quota usage
-- Returns all fields needed by the application
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
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uq.id,
        uq.user_id,
        uq.master_user_id,
        uq.id as quota_id,  -- Alias for consistency
        uq.messages_limit - uq.messages_used as messages_remaining,
        uq.messages_limit,
        uq.messages_used,
        uq.plan_type,
        uq.reset_date,
        uq.is_active,
        uq.created_at,
        uq.updated_at
    FROM public.user_quotas uq
    WHERE uq.user_id = p_user_id 
    AND uq.is_active = true
    ORDER BY uq.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_quota_usage(UUID) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.check_quota_usage(UUID) IS 
'Check quota usage for a user. Returns active quota with calculated remaining messages.';
