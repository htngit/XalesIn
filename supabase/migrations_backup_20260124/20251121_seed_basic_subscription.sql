-- Migration: Seed Pro Yearly Subscription for User
-- User ID: ce73a29f-b232-439d-b10f-90c8868513f9
-- Description: Upgrade user to Pro Yearly plan with unlimited messages for 1 year
-- Created: 2025-11-22

BEGIN;

-- Update user_quotas to Pro Yearly plan
UPDATE user_quotas
SET 
    plan_type = 'basic',
    messages_limit = 750,  -- Unlimited messages
    messages_used = 0,
    reset_date = CURRENT_DATE + INTERVAL '31 days',  -- 1 year subscription
    is_active = true,
    updated_at = NOW()
WHERE user_id = '4c4a82d9-fca1-43df-8cc1-7e8ec880ee83';

-- Insert or update subscription record (if subscriptions table exists)
INSERT INTO subscriptions (user_id, plan_type, billing_cycle, start_date, end_date, is_active, created_at, updated_at)
VALUES (
    '4c4a82d9-fca1-43df-8cc1-7e8ec880ee83',
    'basic',
    'monthly',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '31 days',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET
    plan_type = EXCLUDED.plan_type,
    billing_cycle = EXCLUDED.billing_cycle,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Verify the update
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_quotas
    WHERE user_id = '4c4a82d9-fca1-43df-8cc1-7e8ec880ee83'
    AND plan_type = 'basic'
    AND messages_limit = 750
    AND reset_date >= CURRENT_DATE + INTERVAL '31 days';  -- Allow 1 day tolerance
    
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Basic subscription upgrade failed for user 4c4a82d9-fca1-43df-8cc1-7e8ec880ee83';
    END IF;
    
    RAISE NOTICE 'Successfully upgraded user to Basic plan (750 messages for 1 month)';
END $$;

COMMIT;
