
import { MapScraper } from '../src/main/mapScraper';
import { app } from 'electron';

// Mock Electron app
jest.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false
    },
    ipcMain: {
        handle: jest.fn()
    }
}));

async function testGoogleScrape() {
    const scraper = new MapScraper();
    const mockEvent = {
        sender: {
            send: (channel: string, data: any) => {
                console.log(`[IPC ${channel}]`, data);
            }
        }
    } as any;

    console.log('Starting Google Maps Scrape Test...');
    try {
        const results = await scraper.scrapeGoogleMaps(mockEvent, 'Coffee Shop Jakarta Selatan', 5);
        console.log('Scraping completed!');
        console.log('Results:', results);
    } catch (error) {
        console.error('Scraping failed:', error);
    }
}

testGoogleScrape();
