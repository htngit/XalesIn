CREATE OR REPLACE FUNCTION sync_pull_contacts(
    p_master_user_id UUID,
    p_last_sync TIMESTAMPTZ DEFAULT '1970-01-01'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN (
        SELECT json_agg(t)
        FROM (
            SELECT *
            FROM contacts
            WHERE master_user_id = p_master_user_id
            AND updated_at > p_last_sync
        ) t
    );
END;
$$;
