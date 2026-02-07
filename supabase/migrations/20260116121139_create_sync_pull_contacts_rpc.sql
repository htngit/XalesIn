CREATE OR REPLACE FUNCTION sync_pull_contacts(p_master_user_id UUID)
RETURNS SETOF contacts
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM contacts
  WHERE master_user_id = p_master_user_id
    AND is_blocked = false
  ORDER BY updated_at DESC
  LIMIT 15000;
$$;

GRANT EXECUTE ON FUNCTION sync_pull_contacts(UUID) TO authenticated;

COMMENT ON FUNCTION sync_pull_contacts IS 'Fetches all non-blocked contacts for a given master user ID. Returns up to 15,000 records.';
