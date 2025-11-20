-- Migration: Seed Enterprise Subscription for User
-- User ID: ce73a29f-b232-439d-b10f-90c8868513f9
-- Description: Upgrade user to Enterprise plan with unlimited messages
-- Created: 2025-11-21

BEGIN;

-- Update user_quotas to Enterprise plan (Max Tier)
UPDATE user_quotas
SET 
    plan_type = 'enterprise',
    messages_limit = 999999, -- Effectively unlimited
    messages_used = 0,
    reset_date = CURRENT_DATE + INTERVAL '30 days',
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
    AND plan_type = 'enterprise'
    AND messages_limit = 999999;
    
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Enterprise subscription upgrade failed for user ce73a29f-b232-439d-b10f-90c8868513f9';
    END IF;
    
    RAISE NOTICE 'Successfully upgraded user to Enterprise plan (Unlimited messages)';
END $$;

COMMIT;
