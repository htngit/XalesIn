-- Allow contacts to exist without a group assignment
ALTER TABLE contacts ALTER COLUMN group_id DROP NOT NULL;
