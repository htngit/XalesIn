CREATE OR REPLACE FUNCTION sync_pull_contacts(p_master_user_id UUID, p_last_sync TEXT DEFAULT '1970-01-01T00:00:00.000Z')
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
      AND updated_at > p_last_sync::timestamptz
    ORDER BY updated_at DESC
    LIMIT 15000
  ) t;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION sync_pull_contacts(UUID, TEXT) TO authenticated;
