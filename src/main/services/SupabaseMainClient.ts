/**
 * Supabase client for Main Process (Electron)
 * Uses Node.js environment variables instead of Vite's import.meta.env
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded for now - these are public (anon) keys, safe to include
// In production, could also read from a config file in userData
const SUPABASE_URL = 'https://xasuqqebngantzaenmwq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhc3VxcWVibmdhbnR6YWVubXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzIzOTcsImV4cCI6MjA3ODEwODM5N30.muZXEGe5m6apaaVu6xK8tL-PpM8c0SHuZL3XzoxQf3Q';

let supabaseMainClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client for Main Process
 */
export function getSupabaseMainClient(): SupabaseClient {
    if (!supabaseMainClient) {
        supabaseMainClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseMainClient;
}


