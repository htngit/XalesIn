-- Migration: Seed Pro Yearly Subscription for User
-- User ID: ce73a29f-b232-439d-b10f-90c8868513f9
-- Description: Upgrade user to Pro Yearly plan with unlimited messages for 1 year
-- Created: 2025-11-22

BEGIN;

-- Update user_quotas to Pro Yearly plan
UPDATE user_quotas
SET 
    plan_type = 'pro',
    messages_limit = 999999,  -- Unlimited messages
    messages_used = 0,
    reset_date = CURRENT_DATE + INTERVAL '365 days',  -- 1 year subscription
    is_active = true,
    updated_at = NOW()
WHERE user_id = 'ce73a29f-b232-439d-b10f-90c8868513f9';

-- Verify the update
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_quotas
    WHERE user_id = 'ce73a29f-b232-439d-b10f-90c8868513f9'
    AND plan_type = 'pro'
    AND messages_limit = 999999
    AND reset_date >= CURRENT_DATE + INTERVAL '364 days';  -- Allow 1 day tolerance
    
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Pro Yearly subscription upgrade failed for user ce73a29f-b232-439d-b10f-90c8868513f9';
    END IF;
    
    RAISE NOTICE 'Successfully upgraded user to Pro Yearly plan (Unlimited messages for 1 year)';
END $$;

COMMIT;
