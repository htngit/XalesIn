import puppeteer from 'puppeteer';
import { IpcMainInvokeEvent } from 'electron';
import { ScrapedBusiness } from '../types/scraping';
import * as fs from 'fs';
import * as path from 'path';

const logToFile = (msg: string) => {
    try {
        const logPath = path.join(process.cwd(), 'scraper_debug.log');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {
        // ignore
    }
};

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
import { browserManager } from './services/PuppeteerBrowserManager';
import { selectorService } from './services/SelectorService';

export class MapScraper {
    private browser: any = null;
    private isScraping: boolean = false;
    private shouldStop: boolean = false;

    // State for persistence/UI recovery
    private currentProgress = { total: 0, current: 0, message: '' };
    private currentResults: ScrapedBusiness[] = [];

    constructor() { }

    getStatus() {
        return {
            isScraping: this.isScraping,
            progress: this.currentProgress,
            results: this.currentResults
        };
    }

    async scrapeGoogleMaps(
        keyword: string,
        limit: number = 50,
        existingPhones: string[] = [],
        onProgress?: (data: any) => void
    ): Promise<ScrapedBusiness[]> {
        if (this.isScraping) {
            throw new Error('Scraping already in progress');
        }

        this.isScraping = true;
        this.shouldStop = false;

        // Reset State
        this.currentResults = [];
        this.currentProgress = { total: limit, current: 0, message: 'Starting...' };

        const results: ScrapedBusiness[] = []; // Keep local for function flow, but sync to class
        const seenIds = new Set<string>();

        // Create blacklist Set for O(1) lookup
        // Normalize existing phones to just digits
        const blacklist = new Set(
            existingPhones
                .filter(p => !!p)
                .map(p => p.replace(/[^\d]/g, ''))
        );

        console.log(`[MapScraper] Blacklist loaded with ${blacklist.size} existing numbers.`);
        logToFile(`[MapScraper] Blacklist loaded with ${blacklist.size} existing numbers.`);

        const sendProgress = (current: number, message: string) => {
            if (this.shouldStop) return;

            // Sync State
            this.currentProgress = {
                total: limit,
                current: results.length, // Use actual count
                message
            };
            this.currentResults = [...results]; // Copy current results

            if (onProgress) {
                onProgress({
                    total: limit,
                    current,
                    message,
                    isComplete: false
                });
            }
        };

        try {
            console.log(`[MapScraper] Starting Google Maps scrape for "${keyword}" (Limit: ${limit})`);

            // Resolve browser executable path (downloads if needed)
            const executablePath = await browserManager.getExecutablePath((progress: number, msg: string) => {
                const effectiveMsg = progress > 0 ? `${msg} (${progress}%)` : msg;
                sendProgress(0, effectiveMsg);
            });

            sendProgress(0, 'Initializing browser...');

            this.browser = await puppeteer.launch({
                headless: true,
                executablePath: executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-notifications',
                    '--window-size=1366,768',
                    '--lang=en-US' // Force English to ensure aria-labels are consistent
                ]
            });

            const page = await this.browser.newPage();
            // Use realistic User-Agent to avoid detection
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9'
            });
            await page.setViewport({ width: 1366, height: 768 });

            // Step 1: Main Keyword Scrape
            await this.processGoogleKeyword(page, keyword, results, seenIds, limit, sendProgress, 8, blacklist);

            // Step 2: Drill-down Strategy
            if (results.length < limit && !this.shouldStop) {
                sendProgress(results.length, 'Analyzing regional context for drill-down...');
                const districts = await regionService.getDistrictsFromKeyword(keyword);

                if (districts.length > 0) {
                    console.log(`[MapScraper] Drill-down candidates: ${districts.length} districts`);
                    sendProgress(results.length, `Drilling down into ${districts.length} districts...`);

                    for (let i = 0; i < districts.length; i++) {
                        if (results.length >= limit || this.shouldStop) break;

                        const district = districts[i];
                        const subKeyword = `${keyword} ${district}`;

                        sendProgress(results.length, `Scraping subdomain: ${district} (${i + 1}/${districts.length})...`);

                        // Smaller retry count for sub-scrapes
                        await this.processGoogleKeyword(page, subKeyword, results, seenIds, limit, sendProgress, 3, blacklist);
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

    private async processGoogleKeyword(
        page: any,
        keyword: string,
        results: ScrapedBusiness[],
        seenIds: Set<string>,
        limit: number,
        sendProgress: (current: number, message: string) => void,
        maxNoNewDataRetries: number = 8,
        blacklist: Set<string> = new Set()
    ) {
        if (results.length >= limit || this.shouldStop) return;

        logToFile(`[MapScraper] Processing Google keyword: "${keyword}"`);
        console.log(`[MapScraper] Processing Google keyword: "${keyword}"`);
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;

        try {
            // Get dynamic selectors
            const config = await selectorService.getSelectors('google_maps');
            const selectors = config.selectors;

            logToFile(`[MapScraper] Using selectors: ${JSON.stringify(selectors)}`);

            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Handle consent/cookie banner if present (Google often has one)
            try {
                const consentSelector = 'button[aria-label="Accept all"], button[aria-label="Agree to the use of cookies and other data for the purposes described"]';
                const button = await page.$(consentSelector);
                if (button) {
                    await button.click();
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (e) { /* ignore */ }

            // Wait for results container
            try {
                await page.waitForSelector(selectors.results_container || 'div[role="feed"]', { timeout: 10000 });
            } catch (e) {
                // If feed not found, might be 0 results or single result view
            }

            let noNewDataCount = 0;
            let processedIndices = new Set<number>();

            while (results.length < limit && !this.shouldStop) {
                // 1. Get current list of items
                // We re-query every time because DOM might change/detach
                const itemsHandle = await page.$$(selectors.business_card || 'div.Nv2PK');

                let addedInThisPass = 0;
                let foundNewRawItemsInThisPass = 0;

                for (let i = 0; i < itemsHandle.length; i++) {
                    if (results.length >= limit || this.shouldStop) break;
                    if (processedIndices.has(i)) continue; // Skip already processed in this batch (though scroll might shift indices, we handle via ID check too)

                    // Optimization: check if we already have this ID from the link before clicking
                    // This is "Fast Check"
                    const card = itemsHandle[i];
                    const initialInfo = await page.evaluate((el: any, sel: any) => {
                        const linkEl = el.querySelector(sel.link || 'a.hfpxzc');
                        const url = linkEl?.getAttribute('href') || '';
                        const nameEl = el.querySelector(sel.name || 'div.qBF1Pd');
                        const name = nameEl?.textContent?.trim();
                        return { id: url || name, name };
                    }, card, selectors);

                    if (seenIds.has(initialInfo.id)) {
                        processedIndices.add(i);
                        continue;
                    }

                    // 2. Click to open details
                    try {
                        console.log(`[MapScraper] Clicking item ${i}: ${initialInfo.name}...`);
                        await card.click();

                        // Wait for detail pane to load
                        // Look for a known element in detail view, e.g., the close button or a specific header
                        // 'div[role="main"]' is often the detail container
                        await page.waitForSelector('div[role="main"]', { timeout: 5000 });

                        // Small delay for dynamic content (phone, hours) to populate
                        await new Promise(r => setTimeout(r, 1000));

                        // 3. Extract details from page (Detail Pane)
                        const details = await page.evaluate((targetName: string) => {
                            const mainRoles = Array.from(document.querySelectorAll('div[role="main"]'));

                            // Strategy: The detail pane is usually the LAST one opened (overlay), 
                            // OR the one containing the specific H1 of the business.
                            let mainRole = mainRoles.find(el => {
                                const h1 = el.querySelector('h1');
                                return h1 && h1.textContent?.trim() === targetName;
                            });

                            if (!mainRole && mainRoles.length > 0) {
                                // Fallback to the last role="main" which is typically the side panel
                                mainRole = mainRoles[mainRoles.length - 1];
                            }

                            if (!mainRole) return null;

                            // Cast to HTMLElement for easier access
                            const container = mainRole as HTMLElement;

                            // Specific Strategies
                            const getPhone = () => {
                                const buttons = Array.from(container.querySelectorAll('button'));

                                // Strategy 1: data-tooltip="Copy phone number"
                                const tooltipBtn = buttons.find(b => b.getAttribute('data-tooltip') === 'Copy phone number');
                                if (tooltipBtn) return tooltipBtn.getAttribute('aria-label')?.replace('Phone: ', '').trim();

                                // Strategy 2: data-item-id starts with "phone:"
                                const itemIdBtn = buttons.find(b => b.getAttribute('data-item-id')?.startsWith('phone:'));
                                if (itemIdBtn) return itemIdBtn.getAttribute('aria-label')?.replace('Phone: ', '').trim();

                                // Strategy 3: look for phone icon or valid phone pattern in aria-label
                                const phoneBtn = buttons.find(b => {
                                    const label = b.getAttribute('aria-label') || '';
                                    return label.includes('Phone:') || label.includes('+62') || label.startsWith('08');
                                });

                                if (phoneBtn) {
                                    const label = phoneBtn.getAttribute('aria-label') || '';
                                    const parts = label.split('Phone:');
                                    if (parts.length > 1) return parts[1].trim();
                                    return phoneBtn.textContent?.trim();
                                }

                                // Strategy 4: Text content search in the whole panel (Last Resort)
                                const bodyText = container.innerText;
                                const phoneMatch = bodyText.match(/(\+62|62|0)8[0-9\-\s]{5,13}/);
                                if (phoneMatch) return phoneMatch[0].trim();

                                return '';
                            };

                            // Debug: Return button attributes if phone not found
                            const getDebugInfo = () => {
                                return Array.from(container.querySelectorAll('button')).map(b => ({
                                    ariaLabel: b.getAttribute('aria-label'),
                                    dataItemId: b.getAttribute('data-item-id'),
                                    dataTooltip: b.getAttribute('data-tooltip'),
                                    text: (b as HTMLElement).innerText
                                }));
                            };

                            const phone = getPhone();

                            return {
                                phone: phone,
                                debugButtons: !phone ? getDebugInfo() : [],
                                website: (() => {
                                    const buttons = Array.from(container.querySelectorAll('a'));
                                    const webBtn = buttons.find(b => b.getAttribute('data-item-id') === 'authority');
                                    return webBtn?.getAttribute('href') || '';
                                })(),
                                address: (() => {
                                    const buttons = Array.from(container.querySelectorAll('button'));
                                    const addrBtn = buttons.find(b => b.getAttribute('data-item-id') === 'address');
                                    return addrBtn?.getAttribute('aria-label')?.replace('Address: ', '').trim() || '';
                                })(),
                                name: container.querySelector('h1')?.textContent?.trim()
                            };
                        }, initialInfo.name);

                        // Log debug info if phone missing
                        if (!details?.phone) {
                            const msg = `[MapScraper] Phone missing for ${initialInfo.name}. Buttons found: ${JSON.stringify(details?.debugButtons?.slice(0, 5))}`;
                            console.log(msg);
                            logToFile(msg);
                        } else {
                            logToFile(`[MapScraper] Found phone for ${initialInfo.name}: ${details.phone}`);
                        }

                        // CRITICAL: Verify extracted name matches expected name
                        // This prevents data from a previously opened panel being attributed to the current click
                        if (details && details.name && details.name !== initialInfo.name) {
                            const mismatchMsg = `[MapScraper] NAME MISMATCH: Expected "${initialInfo.name}" but got "${details.name}". Skipping to avoid data corruption.`;
                            console.warn(mismatchMsg);
                            logToFile(mismatchMsg);
                            processedIndices.add(i);
                            continue;
                        }

                        const item = {
                            ...initialInfo,
                            ...details
                        };

                        if (!seenIds.has(item.id)) {
                            seenIds.add(item.id);
                            foundNewRawItemsInThisPass++;

                            // Check Deduplication and Blacklist
                            const rawPhone = item.phone || '';
                            const normalizedPhone = rawPhone.replace(/[^\d]/g, '');

                            // 1. Check Blacklist (Zero Bandwidth Check)
                            if (blacklist.has(normalizedPhone)) {
                                const msg = `[MapScraper] SKIP Existing Contact: ${item.name} (${rawPhone})`;
                                console.log(msg);
                                logToFile(msg);
                                continue; // Skip this iteration
                            }

                            // 2. Check Internal Duplicate in Results (by Phone)
                            // We already check seenIds (URL/Name), but phone check is safer if URL changes
                            const isInternalDup = results.some(r => r.phone && r.phone.replace(/[^\d]/g, '') === normalizedPhone);
                            if (isInternalDup) {
                                const msg = `[MapScraper] SKIP Internal Duplicate: ${item.name} (${rawPhone})`;
                                console.log(msg);
                                logToFile(msg);
                                continue;
                            }

                            // 3. STRICT PHONE CHECK (New Requirement)
                            // If no phone, we count it as 'scanned' (so we don't think we are stuck), 
                            // but we do NOT add it to results, and do NOT count towards limit.
                            item.phone = item.phone ? item.phone.replace(/[^0-9+]/g, '') : '';

                            if (!item.phone || item.phone.length < 5) { // Basic length check
                                const msg = `[MapScraper] SKIP No Phone (Strict Mode): ${item.name}`;
                                console.log(msg);
                                logToFile(msg);
                                continue;
                            }

                            results.push(item);
                            addedInThisPass++;

                            const logMsg = `[MapScraper] Scraped FRESH: ${item.name} | Phone: ${item.phone || 'null'} | Web: ${item.website || 'null'}`;
                            console.log(logMsg);
                            logToFile(logMsg);

                            sendProgress(results.length, `Found: ${item.name} (${item.phone || 'No Phone'})`);
                        }
                        processedIndices.add(i);
                    } catch (err) {
                        const errMsg = `[MapScraper] Failed to click/extract item ${i}: ${err}`;
                        console.warn(errMsg);
                        logToFile(errMsg);
                    }
                }

                // If we didn't find ANY new item IDs (regardless of phone), then we might be stuck or at end.
                // Reset counter if we found *any* new items (even if we skipped them due to no phone).
                if (foundNewRawItemsInThisPass === 0) {
                    noNewDataCount++;
                } else {
                    noNewDataCount = 0;
                }

                if (noNewDataCount > maxNoNewDataRetries) {
                    console.log('[MapScraper] Max retries reached with no new data.');
                    break;
                }

                // Scroll Logic
                await page.evaluate((sel: any) => {
                    const feed = document.querySelector(sel.results_container || 'div[role="feed"]');
                    if (feed) {
                        feed.scrollTop += feed.clientHeight;
                    } else {
                        window.scrollBy(0, 500);
                    }
                }, selectors);

                // Wait for scroll load
                await new Promise(r => setTimeout(r, 2000));

                // Check End of List
                const isEndOfList = await page.evaluate(() => {
                    return document.body.innerText.includes("You've reached the end of the list");
                });
                if (isEndOfList) break;
            }
        } catch (error) {
            console.warn(`[MapScraper] Error processing Google keyword "${keyword}":`, error);
        }
    }

    async scrapeBingMaps(
        keyword: string,
        limit: number = 50,
        existingPhones: string[] = [],
        onProgress?: (data: any) => void
    ): Promise<ScrapedBusiness[]> {
        if (this.isScraping) {
            throw new Error('Scraping already in progress');
        }

        this.isScraping = true;
        this.shouldStop = false;

        // Reset State
        this.currentResults = [];
        this.currentProgress = { total: limit, current: 0, message: 'Starting...' };

        const results: ScrapedBusiness[] = [];
        const seenIds = new Set<string>();

        // Create blacklist Set for O(1) lookup
        // Normalize existing phones to just digits
        const blacklist = new Set(
            existingPhones
                .filter(p => !!p)
                .map(p => p.replace(/[^\d]/g, ''))
        );

        console.log(`[MapScraper] Blacklist loaded with ${blacklist.size} existing numbers.`);
        logToFile(`[MapScraper] Blacklist loaded with ${blacklist.size} existing numbers.`);

        const sendProgress = (current: number, message: string) => {
            // Sync State
            this.currentProgress = {
                total: limit,
                current: results.length,
                message
            };
            this.currentResults = [...results];

            if (onProgress) {
                onProgress({
                    total: limit,
                    current,
                    message,
                    isComplete: false
                });
            }
        };

        try {
            console.log(`[MapScraper] Starting Bing Maps scrape for "${keyword}" (Limit: ${limit})`);

            // Resolve browser executable path (downloads if needed)
            const executablePath = await browserManager.getExecutablePath((progress: number, msg: string) => {
                const effectiveMsg = progress > 0 ? `${msg} (${progress}%)` : msg;
                sendProgress(0, effectiveMsg);
            });

            sendProgress(0, 'Initializing browser...');

            this.browser = await puppeteer.launch({
                headless: true,
                executablePath: executablePath, // Explicitly provide the path
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
        maxNoNewDataRetries: number = 8,
        blacklist: Set<string> = new Set()
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
                // Bing Selectors - could be moved to dynamic config later if desired
                await page.waitForSelector('.b_vList, .b_lstcards, [data-entity]', { timeout: 10000 });
            } catch (e) {
                // If it times out immediately, it might be 0 results. 
                // We'll proceed to the loop which will check extraction.
            }

            await new Promise(r => setTimeout(r, 2000));

            let noNewDataCount = 0;

            while (results.length < limit && !this.shouldStop) {
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

                let foundNewRawItemsInThisPass = 0;

                // Add to results
                for (const item of newItems) {
                    if (results.length >= limit) break;
                    const uniqueId = item.id || (item.name + item.address);
                    if (!seenIds.has(uniqueId)) {
                        seenIds.add(uniqueId);
                        foundNewRawItemsInThisPass++;

                        const rawPhone = item.phone || '';
                        const normalizedPhone = rawPhone.replace(/[^\d]/g, '');

                        // 1. Check Blacklist (Zero Bandwidth Check)
                        if (blacklist.has(normalizedPhone)) {
                            const msg = `[MapScraper] SKIP Existing Contact: ${item.name} (${rawPhone})`;
                            console.log(msg);
                            logToFile(msg);
                            continue; // Skip this iteration
                        }

                        // 2. Check Internal Duplicate in Results (by Phone)
                        const isInternalDup = results.some(r => r.phone && r.phone.replace(/[^\d]/g, '') === normalizedPhone);
                        if (isInternalDup) {
                            const msg = `[MapScraper] SKIP Internal Duplicate: ${item.name} (${rawPhone})`;
                            console.log(msg);
                            logToFile(msg);
                            continue;
                        }

                        // 3. Strict Phone Check
                        item.phone = item.phone ? item.phone.replace(/[^0-9+]/g, '') : '';

                        if (item.phone && item.phone.length >= 5) {
                            results.push(item);

                            const logMsg = `[MapScraper] Scraped FRESH: ${item.name} | Phone: ${item.phone} | Web: ${item.website || 'null'}`;
                            console.log(logMsg);
                            logToFile(logMsg);
                        } else {
                            const msg = `[MapScraper] SKIP No Phone (Strict Mode): ${item.name}`;
                            console.log(msg);
                            logToFile(msg);
                        }
                    }
                }

                sendProgress(results.length, `Found ${results.length} businesses...`);

                // If we didn't find ANY new unique items (regardless of phone), count as "stuck"
                if (foundNewRawItemsInThisPass === 0) {
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
