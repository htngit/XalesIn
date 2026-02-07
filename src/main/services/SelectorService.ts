import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// Manual .env loading for Main Process (since dotenv is not installed)
// This ensures process.env is populated before we use it
try {
  const logPath = path.join(process.cwd(), 'scraper_debug.log');
  const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

  log(`[EnvLoader] CWD: ${process.cwd()}`);

  // Try multiple paths for .env
  const possiblePaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(app.getAppPath(), '.env')
  ];

  let loaded = false;
  for (const p of possiblePaths) {
    log(`[EnvLoader] Checking path: ${p}`);
    if (fs.existsSync(p)) {
      const envConfig = fs.readFileSync(p, 'utf-8');
      let count = 0;
      envConfig.split('\n').forEach(line => {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.startsWith('#')) return;

        const match = cleanLine.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();

          // Handle quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          if (!process.env[key]) {
            process.env[key] = value;
            count++;
          }
        }
      });
      log(`[EnvLoader] Loaded .env from ${p} (${count} keys)`);
      console.log('[EnvLoader] Loaded .env file successfully');
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    log('[EnvLoader] FAILED TO FIND .env file in any checked path.');
    console.warn('[EnvLoader] .env file not found.');
  }
} catch (error) {
  console.error('[EnvLoader] Error loading .env:', error);
}

interface ScraperSelector {
  platform: string;
  selectors: {
    results_container: string;
    business_card: string;
    name: string;
    phone: string;
    address: string;
    website?: string;
    rating?: string;
    reviews_count?: string;
    link?: string;
  };
  version: number;
}

class SelectorService {
  private supabase: SupabaseClient | null = null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor() {
    this.initializeSupabase();
  }

  private initializeSupabase() {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

      console.log('[SelectorService] Initializing Supabase with URL:', supabaseUrl ? 'Found' : 'Missing');

      if (supabaseUrl && supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: false
          }
        });
      } else {
        console.warn('[SelectorService] Supabase credentials missing via process.env. Using defaults.');
      }
    } catch (error) {
      console.error('[SelectorService] Failed to initialize Supabase:', error);
    }
  }

  async getSelectors(platform: 'google_maps' | 'bing_maps'): Promise<ScraperSelector> {
    // Check cache first
    const cached = this.cache.get(platform);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    let selectors = this.getDefaultSelectors(platform);

    try {
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('app_configs')
          .select('value')
          .eq('key', `scraper_selectors_${platform}`)
          .eq('is_active', true)
          .single();

        if (error) throw error;

        if (data?.value) {
          selectors = { ...selectors, ...data.value }; // Merge with defaults
          // Update cache
          this.cache.set(platform, {
            data: selectors,
            timestamp: Date.now()
          });
          console.log(`[SelectorService] Loaded dynamic selectors for ${platform}`);
        }
      } else {
        console.log(`[SelectorService] Supabase client not initialized. Using defaults.`);
      }
    } catch (error) {
      console.warn(`[SelectorService] Failed to fetch selectors for ${platform}, using defaults:`, error);
    }

    return selectors;
  }

  private getDefaultSelectors(platform: string): ScraperSelector {
    if (platform === 'bing_maps') {
      return {
        platform: 'bing_maps',
        version: 1,
        selectors: {
          results_container: '.m_standard_layout_content',
          business_card: '.b_algo',
          name: 'h2',
          phone: '.b_factrow',
          address: '.b_address',
          link: 'a'
        }
      };
    }

    // Default Google Maps selectors (Classic / List Side Panel)
    return {
      platform: 'google_maps',
      version: 1,
      selectors: {
        results_container: 'div[role="feed"]', // Feed container
        business_card: 'div.Nv2PK', // Card container
        name: 'div.qBF1Pd', // Name
        phone: 'span.UsdlK', // Phone in list view (often missing/hidden)
        address: 'div.W4Efsd:nth-of-type(1) > span:nth-of-type(2) > span:nth-of-type(2)',
        website: 'a.lcr4fd',
        rating: 'span.MW4etd',
        reviews_count: 'span.UY7F9',
        link: 'a.hfpxzc'
      }
    };
  }

  async refreshSelectors(): Promise<void> {
    this.cache.clear();
    await this.getSelectors('google_maps');
    await this.getSelectors('bing_maps');
  }
}

export const selectorService = new SelectorService();
