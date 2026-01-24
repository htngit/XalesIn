-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    group_id UUID, -- Foreign key to groups table (will add constraint later if groups table exists)
    master_user_id UUID NOT NULL REFERENCES auth.users(id),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    tags TEXT[],
    notes TEXT,
    is_blocked BOOLEAN DEFAULT false,
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own contacts (based on master_user_id)
CREATE POLICY "Users can view their own contacts"
    ON public.contacts
    FOR SELECT
    USING (auth.uid() = master_user_id OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE master_user_id = contacts.master_user_id
    ));

-- Policy for users to insert their own contacts
CREATE POLICY "Users can insert their own contacts"
    ON public.contacts
    FOR INSERT
    WITH CHECK (auth.uid() = master_user_id OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE master_user_id = contacts.master_user_id
    ));

-- Policy for users to update their own contacts
CREATE POLICY "Users can update their own contacts"
    ON public.contacts
    FOR UPDATE
    USING (auth.uid() = master_user_id OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE master_user_id = contacts.master_user_id
    ));

-- Policy for users to delete their own contacts
CREATE POLICY "Users can delete their own contacts"
    ON public.contacts
    FOR DELETE
    USING (auth.uid() = master_user_id OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE master_user_id = contacts.master_user_id
    ));

-- Create index for faster search
CREATE INDEX IF NOT EXISTS contacts_master_user_id_idx ON public.contacts(master_user_id);
CREATE INDEX IF NOT EXISTS contacts_group_id_idx ON public.contacts(group_id);
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON public.contacts(phone);
