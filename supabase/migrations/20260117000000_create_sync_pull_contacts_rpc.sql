-- Migration: Create sync_pull_contacts RPC Function
-- Purpose: Fetch all valid contacts for a user in a single request, bypassing API row limits.

CREATE OR REPLACE FUNCTION sync_pull_contacts(p_master_user_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT coalesce(json_agg(t), '[]'::json)
  FROM (
    SELECT *
    FROM contacts
    WHERE master_user_id = p_master_user_id
      AND is_blocked = false
    ORDER BY updated_at DESC
    LIMIT 15000
  ) t;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION sync_pull_contacts(UUID) TO authenticated;

COMMENT ON FUNCTION sync_pull_contacts IS 'Fetches all non-blocked contacts for a given master user ID. Returns up to 15,000 records.';
