import puppeteer from 'puppeteer';
import { IpcMainInvokeEvent } from 'electron';
import { ScrapedBusiness } from '../types/scraping';

// Helper to sanitize phone numbers
const sanitizePhone = (raw: string): string => {
    if (!raw) return '';
    let phone = raw.replace(/[^0-9+]/g, '');

    // Basic normalization for Indonesia
    if (phone.startsWith('0')) {
        phone = '+62' + phone.substring(1);
    } else if (phone.startsWith('62')) {
        phone = '+' + phone;
    }

    return phone;
};

import { regionService } from './services/RegionService';

export class MapScraper {
    private browser: any = null;
    private isScraping: boolean = false;
    private shouldStop: boolean = false;

    constructor() { }

    async scrapeBingMaps(
        event: IpcMainInvokeEvent,
        keyword: string,
        limit: number = 50
    ): Promise<ScrapedBusiness[]> {
        if (this.isScraping) {
            throw new Error('Scraping already in progress');
        }

        this.isScraping = true;
        this.shouldStop = false;
        const results: ScrapedBusiness[] = [];
        const seenIds = new Set<string>();

        const sendProgress = (current: number, message: string) => {
            event.sender.send('maps:progress', {
                total: limit,
                current,
                message,
                isComplete: false
            });
        };

        try {
            console.log(`[MapScraper] Starting Bing Maps scrape for "${keyword}" (Limit: ${limit})`);
            sendProgress(0, 'Initializing browser...');

            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-notifications',
                    '--window-size=1366,768'
                ]
            });

            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });

            // Step 1: Main Keyword Scrape
            await this.processKeyword(page, keyword, results, seenIds, limit, sendProgress);

            // Step 2: Drill-down Strategy (if needed)
            if (results.length < limit && !this.shouldStop) {
                sendProgress(results.length, 'Analyzing regional context for drill-down...');
                const districts = await regionService.getDistrictsFromKeyword(keyword);

                if (districts.length > 0) {
                    console.log(`[MapScraper] Drill-down candidates: ${districts.length} districts`);
                    sendProgress(results.length, `Drilling down into ${districts.length} districts...`);

                    for (let i = 0; i < districts.length; i++) {
                        if (results.length >= limit || this.shouldStop) break;

                        const district = districts[i];
                        // Construct sub-keyword: "Restaurant in [District] [City]"
                        // Heuristic: Append District to the original keyword
                        // "Restoran di Jakarta Selatan" + " " + "Tebet" -> "Restoran di Jakarta Selatan Tebet"
                        // Bing Maps generally understands this well.
                        const subKeyword = `${keyword} ${district}`;

                        sendProgress(results.length, `Scraping subdomain: ${district} (${i + 1}/${districts.length})...`);

                        // We set a smaller "no data" threshold for sub-scrapes to move fast
                        await this.processKeyword(page, subKeyword, results, seenIds, limit, sendProgress, 3);
                    }
                } else {
                    console.log('[MapScraper] No drill-down districts found.');
                }
            }

        } catch (error) {
            console.error('[MapScraper] Error:', error);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            this.isScraping = false;
        }

        return results.map(r => ({
            ...r,
            phone: sanitizePhone(r.phone)
        }));
    }

    private async processKeyword(
        page: any,
        keyword: string,
        results: ScrapedBusiness[],
        seenIds: Set<string>,
        limit: number,
        sendProgress: (current: number, message: string) => void,
        maxNoNewDataRetries: number = 8
    ) {
        if (results.length >= limit || this.shouldStop) return;

        console.log(`[MapScraper] Processing keyword: "${keyword}"`);
        const searchUrl = `https://www.bing.com/maps?q=${encodeURIComponent(keyword)}`;

        try {
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Cookie banner handling
            try {
                const consentSelector = '#bnp_btn_accept, .bnp_btn_accept, button[title="Accept"], #cmpbntyestxt';
                const button = await page.$(consentSelector);
                if (button) {
                    await button.click();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) { /* ignore */ }

            // Wait for list or generic content
            try {
                await page.waitForSelector('.b_vList, .b_lstcards, [data-entity]', { timeout: 10000 });
            } catch (e) {
                // If it times out immediately, it might be 0 results. 
                // We'll proceed to the loop which will check extraction.
            }

            await new Promise(r => setTimeout(r, 2000));

            let noNewDataCount = 0;

            while (results.length < limit && !this.shouldStop) {
                const initialCount = results.length;

                // Extraction Logic (Same as before)
                const newItems = await page.evaluate(() => {
                    const items: any[] = [];
                    const potentialItems = document.querySelectorAll('[data-entity], .b_algo, li a[data-entity], .b_split_card');

                    potentialItems.forEach((el) => {
                        let entity: any = null;
                        if (el.hasAttribute('data-entity')) {
                            try {
                                const json = JSON.parse(el.getAttribute('data-entity') || '{}');
                                if (json && json.entity) {
                                    entity = {
                                        name: json.entity.title,
                                        phone: json.entity.phone,
                                        address: json.entity.address,
                                        website: json.entity.website,
                                        id: json.entity.id,
                                        category: json.entity.primaryCategoryName
                                    };
                                }
                            } catch (e) { }
                        }
                        if (!entity) {
                            const name = el.querySelector('h2, .b_factrow strong')?.textContent?.trim();
                            if (name) {
                                const phoneEl = el.querySelector('[data-entity-id*="Phone"], a[href^="tel"]');
                                const phone = phoneEl?.textContent?.trim() || '';
                                const address = el.querySelector('.address, .b_address')?.textContent?.trim() || '';
                                const website = el.querySelector('a[href^="http"]:not([href*="bing.com"])')?.getAttribute('href') || '';
                                entity = { name, phone, address, website, id: name + address };
                            }
                        }
                        if (entity && entity.name) items.push(entity);
                    });
                    return items;
                });

                // Add to results
                for (const item of newItems) {
                    if (results.length >= limit) break;
                    const uniqueId = item.id || (item.name + item.address);
                    if (!seenIds.has(uniqueId)) {
                        seenIds.add(uniqueId);
                        item.phone = item.phone ? item.phone.replace(/[^0-9+]/g, '') : '';
                        results.push(item);
                    }
                }

                const addedCount = results.length - initialCount;
                sendProgress(results.length, `Found ${results.length} businesses...`);

                if (addedCount === 0) {
                    noNewDataCount++;
                    if (noNewDataCount > maxNoNewDataRetries) break;
                } else {
                    noNewDataCount = 0;
                }

                if (this.shouldStop) break;

                // Scroll Logic
                await page.evaluate(() => {
                    const candidates = [
                        document.querySelector('.b_vList')?.parentElement,
                        document.querySelector('#sidebar'),
                        document.querySelector('.b_ans'),
                        document.querySelector('#b_results')
                    ];
                    const scrollContainer = candidates.find(c => c && c.scrollHeight > c.clientHeight);
                    if (scrollContainer) {
                        scrollContainer.scrollTop += scrollContainer.clientHeight;
                        return true;
                    } else {
                        window.scrollBy(0, 800);
                        return true;
                    }
                });

                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (error) {
            console.warn(`[MapScraper] Error processing keyword "${keyword}":`, error);
            // Don't throw logic error here, allow drill-down to continue
        }
    }

    cancel() {
        this.shouldStop = true;
    }
}

export const mapScraper = new MapScraper();
