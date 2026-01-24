-- Remove unique constraint on (phone, master_user_id) from contacts table
-- This allows multiple users to have contacts with the same phone number

ALTER TABLE contacts 
DROP CONSTRAINT IF EXISTS contacts_phone_master_user_id_key;

-- Add a comment to document why this constraint was removed
COMMENT ON TABLE contacts IS 'Contacts table - allows duplicate phone numbers across different master users since multiple users can have the same contact';
