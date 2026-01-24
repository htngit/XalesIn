-- Create app_configs table for storing dynamic application configurations
-- This allows updating WhatsApp engine settings without app re-downloads

CREATE TABLE IF NOT EXISTS public.app_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.app_configs IS 'Stores dynamic application configurations that can be updated without releasing a new app version.';

-- Create index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_app_configs_key ON public.app_configs(key);

-- Enable RLS (Row Level Security)
ALTER TABLE public.app_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read configs (they are public settings)
CREATE POLICY "Allow authenticated read access" ON public.app_configs
    FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: Allow service role to manage configs
CREATE POLICY "Allow service role full access" ON public.app_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Insert initial WhatsApp engine configuration with fallback versions
INSERT INTO public.app_configs (key, value, description)
VALUES (
    'whatsapp_engine_config',
    '{
        "versions": [
            {
                "id": "v1",
                "name": "Latest Stable",
                "web_version_url": "https://raw.githubusercontent.com/AventusM/WAWebVersions/main/html/2.3000.1017900.html",
                "is_default": true
            },
            {
                "id": "v2", 
                "name": "Fallback 1",
                "web_version_url": "https://raw.githubusercontent.com/AventusM/WAWebVersions/main/html/2.2412.54.html",
                "is_default": false
            },
            {
                "id": "v3",
                "name": "WPPConnect Archive",
                "web_version_url": "https://raw.githubusercontent.com/AventusM/WAWebVersions/main/html/2.2409.0.html",
                "is_default": false
            }
        ],
        "puppeteer_args": [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu"
        ]
    }'::jsonb,
    'WhatsApp Engine configuration with version rotation support. If v1 fails, app can try v2, v3, etc.'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_app_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_app_configs_updated_at ON public.app_configs;
CREATE TRIGGER trigger_app_configs_updated_at
    BEFORE UPDATE ON public.app_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_app_configs_updated_at();
