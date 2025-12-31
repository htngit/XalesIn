
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

    /**
     * Analyzes the keyword to find a matching Province -> Regency -> Districts
     * Returns a list of district names if a specific Regency is found in the keyword.
     */
    async getDistrictsFromKeyword(keyword: string): Promise<string[]> {
        try {
            const normalizedKeyword = keyword.toLowerCase();

            // 1. Get Provinces
            const provinces = await this.getProvinces();

            // 2. Find Candidate Provinces
            // Match "jakarta" from "DKI JAKARTA", or "jawa barat"
            // Heuristic: check if pro.name is in keyword
            const matchingProvince = provinces.find(p => {
                const pName = p.name.toLowerCase();
                if (normalizedKeyword.includes(pName)) return true;
                // Special case for Jakarta
                if (p.name === 'DKI Jakarta' && normalizedKeyword.includes('jakarta')) return true;
                return false;
            });

            if (!matchingProvince) {
                console.log('[RegionService] No matching province found in keyword');
                return [];
            }

            console.log(`[RegionService] Found context province: ${matchingProvince.name}`);

            // 3. Get Regencies for that Province
            const regencies = await this.getRegencies(matchingProvince.code);

            // 4. Find Candidate Regency
            // "Jakarta Selatan" in "Restoran di Jakarta Selatan"
            const matchingRegency = regencies.find(r => {
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

                return normalizedKeyword.includes(cleanName) || normalizedKeyword.includes(rName);
            });

            if (!matchingRegency) {
                console.log('[RegionService] No matching regency found in keyword');
                return [];
            }

            console.log(`[RegionService] Found context regency: ${matchingRegency.name}`);

            // 5. Get Districts
            const districts = await this.getDistricts(matchingRegency.code);
            return districts.map(d => d.name);

        } catch (error) {
            console.error('[RegionService] Discovery failed:', error);
            return [];
        }
    }
}

export const regionService = new RegionService();
