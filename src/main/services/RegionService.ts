
// Basic types for wilayah.id API
interface BaseRegion {
    code: string;
    name: string;
}

interface RegionResponse<T> {
    data: T[];
    meta: any;
}

export class RegionService {
    private baseUrl = 'https://wilayah.id/api';
    private provincesCache: BaseRegion[] | null = null;
    // Cache for ALL regencies flattened
    private allRegenciesCache: (BaseRegion & { provinceCode: string })[] | null = null;

    constructor() { }

    private async fetchJson<T>(endpoint: string): Promise<T> {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`[RegionService] Error fetching ${endpoint}:`, error);
            throw error;
        }
    }

    async getProvinces(): Promise<BaseRegion[]> {
        if (this.provincesCache) return this.provincesCache;
        const res = await this.fetchJson<RegionResponse<BaseRegion>>('/provinces.json');
        this.provincesCache = res.data;
        return res.data;
    }

    async getRegencies(provinceCode: string): Promise<BaseRegion[]> {
        const res = await this.fetchJson<RegionResponse<BaseRegion>>(`/regencies/${provinceCode}.json`);
        return res.data;
    }

    async getDistricts(regencyCode: string): Promise<BaseRegion[]> {
        const res = await this.fetchJson<RegionResponse<BaseRegion>>(`/districts/${regencyCode}.json`);
        return res.data;
    }

    // New: Fetch ALL regencies in Indonesia (Parallelized)
    async getAllRegencies(): Promise<(BaseRegion & { provinceCode: string })[]> {
        if (this.allRegenciesCache) return this.allRegenciesCache;

        console.log('[RegionService] caching all regencies (lazy load)...');
        const provinces = await this.getProvinces();

        // Parallel fetch with concurrency is naturally handled by JS event loop for network requests
        // But to be safe against rate limits, we could batch. 
        // Given ~38 provinces, firing all at once is usually acceptable for modern APIs.
        const promises = provinces.map(p =>
            this.getRegencies(p.code).then(regs =>
                regs.map(r => ({ ...r, provinceCode: p.code }))
            ).catch(e => {
                console.error(`Failed to load regencies for ${p.name}`, e);
                return [];
            })
        );

        const results = await Promise.all(promises);
        this.allRegenciesCache = results.flat();
        console.log(`[RegionService] Cached ${this.allRegenciesCache.length} regencies.`);
        return this.allRegenciesCache;
    }

    /**
     * Analyzes the keyword to find a matching Province -> Regency -> Districts
     * Returns a list of district names if a specific Regency is found in the keyword.
     */
    async getDistrictsFromKeyword(keyword: string): Promise<string[]> {
        try {
            const normalizedKeyword = keyword.toLowerCase();

            // 1. Get Provinces
            const provinces = await this.getProvinces();

            // 2. Try Find Candidate Province
            // Match "jakarta" from "DKI JAKARTA", or "jawa barat"
            // Heuristic: check if pro.name is in keyword
            const matchingProvince = provinces.find(p => {
                const pName = p.name.toLowerCase();
                if (normalizedKeyword.includes(pName)) return true;
                // Special case for Jakarta
                if (p.name === 'DKI Jakarta' && normalizedKeyword.includes('jakarta')) return true;
                return false;
            });

            let targetRegencies: BaseRegion[] = [];

            if (matchingProvince) {
                console.log(`[RegionService] Found context province: ${matchingProvince.name}`);
                targetRegencies = await this.getRegencies(matchingProvince.code);
            } else {
                console.log('[RegionService] No province found. Switching to Universal Regency Search...');
                // Fallback: Check ALL regencies
                targetRegencies = await this.getAllRegencies();
            }

            // 3. Find Candidate Regency in the target list
            // "Jakarta Selatan" in "Restoran di Jakarta Selatan"
            const matchingRegency = targetRegencies.find(r => {
                const rName = r.name.toLowerCase();
                // Regencies often have "KABUPATEN" or "KOTA" prefix.
                // Standardize: "KOTA ADMINISTRASI JAKARTA SELATAN"
                // User types: "JAKARTA SELATAN"

                // Helper to strip prefixes for matching
                const cleanName = rName
                    .replace('kabupaten administrasi ', '')
                    .replace('kota administrasi ', '')
                    .replace('kabupaten ', '')
                    .replace('kota ', '')
                    .trim();

                // Exact word match capability or include check
                return normalizedKeyword.includes(cleanName) || normalizedKeyword.includes(rName);
            });

            if (!matchingRegency) {
                console.log('[RegionService] No matching regency found in keyword (Global Search).');
                return [];
            }

            console.log(`[RegionService] Found context regency: ${matchingRegency.name}`);

            // 4. Get Districts
            const districts = await this.getDistricts(matchingRegency.code);
            return districts.map(d => d.name);

        } catch (error) {
            console.error('[RegionService] Discovery failed:', error);
            return [];
        }
    }
}

export const regionService = new RegionService();
