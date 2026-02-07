-- Migration: Fix Pro Plan Quota
-- Change quota from -1 to 999999 (unlimited representation)

UPDATE pricing_plans
SET quota = 999999
WHERE plan_type = 'pro' AND quota = -1;
