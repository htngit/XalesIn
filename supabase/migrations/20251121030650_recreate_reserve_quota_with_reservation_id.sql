-- Drop existing function
DROP FUNCTION IF EXISTS public.reserve_quota(uuid, integer);

-- Recreate reserve_quota function to return reservation_id
CREATE OR REPLACE FUNCTION public.reserve_quota(p_user_id uuid, p_amount integer)
RETURNS TABLE(success boolean, reservation_id uuid, messages_remaining integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_quota_id UUID;
    v_current_used INTEGER;
    v_limit INTEGER;
    v_master_user_id UUID;
    v_reservation_id UUID;
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
        RETURN QUERY SELECT false, NULL::UUID, v_limit - v_current_used, 'Insufficient quota';
        RETURN;
    END IF;
    
    -- Create reservation record and get its ID
    INSERT INTO public.quota_reservations (user_id, master_user_id, quota_id, amount, status, expires_at)
    VALUES (p_user_id, v_master_user_id, v_quota_id, p_amount, 'pending', NOW() + INTERVAL '1 hour')
    RETURNING id INTO v_reservation_id;
    
    -- Return success with reservation ID
    RETURN QUERY SELECT true, v_reservation_id, v_limit - v_current_used - p_amount, NULL::TEXT;
END;
$function$;
