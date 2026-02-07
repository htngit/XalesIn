-- Add discount benefit to Pro Yearly plan
UPDATE pricing_plans
SET features = '["Unlimited messages", "Priority support", "Analytics", "Save 20% vs monthly"]'::jsonb
WHERE plan_name = 'Pro - Yearly';
