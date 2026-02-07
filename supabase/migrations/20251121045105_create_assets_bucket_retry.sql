-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public read access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'assets' );

-- Policy: Allow authenticated uploads
CREATE POLICY "Authenticated Uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'assets' );

-- Policy: Allow users to update their own files
CREATE POLICY "User Update Own Files"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'assets' AND auth.uid() = owner );

-- Policy: Allow users to delete their own files
CREATE POLICY "User Delete Own Files"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'assets' AND auth.uid() = owner );
