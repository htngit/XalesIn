-- ============================================================================
-- TEMPLATES VARIANTS UPDATE - FIXED VERSION
-- Date: 2024
-- Description: Update templates table to support multiple variants
-- Fixed: Already included in main schema, this is for backward compatibility
-- ============================================================================

-- Note: The main schema already includes variants field
-- This migration is kept for backward compatibility with existing data

-- Ensure variants column exists (safe if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'templates' 
        AND column_name = 'variants'
    ) THEN
        ALTER TABLE public.templates ADD COLUMN variants TEXT[];
    END IF;
END $$;

-- Ensure category column exists (safe if already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'templates' 
        AND column_name = 'category'
    ) THEN
        ALTER TABLE public.templates ADD COLUMN category TEXT DEFAULT 'general';
    END IF;
END $$;

-- Migrate existing content to first variant (only if not already done)
DO $$
BEGIN
    -- Update templates where content exists but variants is null
    UPDATE public.templates 
    SET variants = ARRAY[content] 
    WHERE variants IS NULL 
    AND content IS NOT NULL 
    AND content != '';
    
    -- For templates with empty content, set empty variants array
    UPDATE public.templates 
    SET variants = ARRAY[]::TEXT[]
    WHERE variants IS NULL 
    AND (content IS NULL OR content = '');
END $$;

-- Make content nullable since we'll use variants (safe if already nullable)
DO $$
BEGIN
    ALTER TABLE public.templates 
    ALTER COLUMN content DROP NOT NULL;
EXCEPTION
    WHEN undefined_column THEN NULL;
    WHEN others THEN NULL;
END $$;

-- Ensure category index exists
DROP INDEX IF EXISTS idx_templates_category;
CREATE INDEX idx_templates_category ON public.templates(category);

-- Add helpful comments
COMMENT ON COLUMN public.templates.variants IS 
'Array of template text variants. At least one variant should be provided.';

COMMENT ON COLUMN public.templates.category IS 
'Template category for organization (e.g., general, marketing, support, etc.)';
