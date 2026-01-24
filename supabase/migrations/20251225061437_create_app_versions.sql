-- Migration: Create app_versions table
-- Purpose: Track application versions with direct download URLs
-- Created: 2025-12-25

-- Create app_versions table
CREATE TABLE IF NOT EXISTS public.app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    download_url TEXT,
    release_notes TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    platform TEXT NOT NULL DEFAULT 'all',
    is_latest BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_app_versions_platform ON public.app_versions(platform);
CREATE INDEX IF NOT EXISTS idx_app_versions_is_latest ON public.app_versions(is_latest);
CREATE INDEX IF NOT EXISTS idx_app_versions_version_code ON public.app_versions(version_code DESC);

-- Enable RLS
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Create public read policy (anyone can read, no auth required)
CREATE POLICY "Allow public read access on app_versions"
    ON public.app_versions
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Create admin write policy (only authenticated users can insert/update/delete)
-- You can modify this later to restrict to specific admin roles
CREATE POLICY "Allow authenticated users to manage app_versions"
    ON public.app_versions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE public.app_versions IS 'Stores application version information with download URLs';
COMMENT ON COLUMN public.app_versions.version IS 'Semantic version string (e.g., 1.0.0, 2.1.3)';
COMMENT ON COLUMN public.app_versions.version_code IS 'Numeric version code for comparison';
COMMENT ON COLUMN public.app_versions.download_url IS 'Direct download URL for this version';
COMMENT ON COLUMN public.app_versions.release_notes IS 'Release notes or changelog for this version';
COMMENT ON COLUMN public.app_versions.is_mandatory IS 'Whether this update is mandatory';
COMMENT ON COLUMN public.app_versions.platform IS 'Target platform (android, windows, ios, all)';
COMMENT ON COLUMN public.app_versions.is_latest IS 'Whether this is the latest version';
