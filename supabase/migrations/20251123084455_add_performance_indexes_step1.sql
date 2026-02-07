-- Migration: Add Performance Indexes (Step 1 of 2)
-- Purpose: Speed up foreign key lookups in trigger operations
-- Expected: Reduce INSERT operation time by 50-70%

-- Index for profiles lookup (used in trigger and queries)
CREATE INDEX IF NOT EXISTS idx_profiles_id_lookup 
ON profiles(id) 
WHERE is_active = true;

-- Index for subscriptions master_user_id lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_master_user_lookup 
ON subscriptions(master_user_id) 
WHERE status = 'active';

-- Index for user_settings user_id lookup
CREATE INDEX IF NOT EXISTS idx_user_settings_user_lookup 
ON user_settings(user_id);
