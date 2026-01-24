-- Migration: Add RLS Policy for Subscription Insert
-- Allow service role (trigger) to insert subscriptions

-- Drop existing INSERT policy if exists
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON public.subscriptions;

-- Create new INSERT policy that allows both user and service role
CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (
    auth.uid() = master_user_id OR auth.role() = 'service_role'
  );
