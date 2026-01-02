export interface ScrapedBusiness {
    name: string;
    phone: string;
    address: string;
    website?: string;
    category?: string;
}

export type ScrapingPlatform = 'bing' | 'google';

export interface ScrapingProgress {
    total: number;
    current: number;
    message: string;
    isComplete: boolean;
    data?: ScrapedBusiness[];
}
