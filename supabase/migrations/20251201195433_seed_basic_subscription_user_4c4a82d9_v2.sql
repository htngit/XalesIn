-- Migration: Seed Basic Monthly Subscription for User
-- User ID: 4c4a82d9-fca1-43df-8cc1-7e8ec880ee83
-- Description: Upgrade user to Basic Monthly plan with 750 messages for 1 month
-- Created: 2025-12-02

BEGIN;

-- Update user_quotas to Basic Monthly plan
UPDATE user_quotas
SET 
    plan_type = 'basic',
    messages_limit = 750,
    messages_used = 0,
    reset_date = CURRENT_DATE + INTERVAL '31 days',
    is_active = true,
    updated_at = NOW()
WHERE user_id = '4c4a82d9-fca1-43df-8cc1-7e8ec880ee83';

-- Verify the update
DO $$
DECLARE
    v_count INTEGER;
    v_plan_type TEXT;
    v_messages_limit INTEGER;
    v_reset_date DATE;
BEGIN
    SELECT COUNT(*), MAX(plan_type), MAX(messages_limit), MAX(reset_date::DATE)
    INTO v_count, v_plan_type, v_messages_limit, v_reset_date
    FROM user_quotas
    WHERE user_id = '4c4a82d9-fca1-43df-8cc1-7e8ec880ee83'
    AND plan_type = 'basic'
    AND messages_limit = 750;
    
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Basic subscription upgrade failed for user 4c4a82d9-fca1-43df-8cc1-7e8ec880ee83';
    END IF;
    
    RAISE NOTICE 'Successfully upgraded user to Basic Monthly plan';
    RAISE NOTICE 'Plan Type: %, Messages Limit: %, Reset Date: %', v_plan_type, v_messages_limit, v_reset_date;
END $$;

COMMIT;
