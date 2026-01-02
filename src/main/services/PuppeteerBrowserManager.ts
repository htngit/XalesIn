import path from 'path';
import { app } from 'electron';
import {
    Browser,
    install,
    detectBrowserPlatform,
} from '@puppeteer/browsers';

/**
 * PuppeteerBrowserManager
 * Handles the resolution and downloading of the Chrome browser for Puppeteer
 * ensuring it works in both dev and production environments.
 */
export class PuppeteerBrowserManager {
    private static instance: PuppeteerBrowserManager;
    // We use a specific build ID that is known to work well with our Puppeteer version
    // Puppeteer v24 usually expects a recent Chrome. 
    // We can fetch the correct revision from puppeteer-core or hardcode a widely compatible one.
    // For now, let's use a stable recent build if we can't dynamic resolve.
    private readonly BROWSER_TAG = '121.0.6167.85'; // Example stable version

    private constructor() { }

    public static getInstance(): PuppeteerBrowserManager {
        if (!PuppeteerBrowserManager.instance) {
            PuppeteerBrowserManager.instance = new PuppeteerBrowserManager();
        }
        return PuppeteerBrowserManager.instance;
    }

    /**
     * Get the cache directory for Puppeteer
     */
    private getCacheDir(): string {
        // In production, use userData so we have write permissions
        // In dev, we can use the project root's .cache or similar
        return app.isPackaged
            ? path.join(app.getPath('userData'), 'puppeteer-cache')
            : path.join(process.cwd(), '.cache', 'puppeteer');
    }

    /**
     * Resolves the executable path, downloading the browser if necessary.
     * @param onProgress Callback for download progress
     */
    public async getExecutablePath(onProgress?: (progress: number, message: string) => void): Promise<string> {
        const cacheDir = this.getCacheDir();
        const platform = detectBrowserPlatform();

        if (!platform) {
            throw new Error('Unsupported platform for Puppeteer');
        }

        console.log(`[BrowserManager] Checking for browser in: ${cacheDir} for platform: ${platform}`);

        // Define the build we want. 
        // Note: Puppeteer often updates which revision it needs.
        // Ideally we read this from puppeteer's package, but for stability in a packaged app
        // it is often better to stick to one version we know works.
        const buildId = this.BROWSER_TAG;

        // Check if already installed
        // The directory structure created by @puppeteer/browsers is usually:
        // cacheDir/chrome/buildId/chrome-win/chrome.exe (on windows)

        // We can use the 'install' function's return value to get the path, 
        // effectively "installing" it if missing, or returning the path if present.
        // However, we want to notify the user if we are downloading.

        try {
            if (onProgress) onProgress(0, 'Checking browser availability...');

            const browser = Browser.CHROME;

            // Check if we can find it structurally first to avoid triggering download immediately
            // This is a bit of a heuristic since @puppeteer/browsers doesn't have a simple "check" 
            // without potential side effects or complex logic.
            // So we will just proceed to install with a callback.

            console.log(`[BrowserManager] Ensuring browser ${buildId} is installed...`);

            const installedBrowser = await install({
                browser: browser,
                buildId: buildId,
                cacheDir: cacheDir,
                platform: platform,
                downloadProgressCallback: (downloadedBytes, totalBytes) => {
                    if (onProgress && totalBytes > 0) {
                        const percentage = Math.round((downloadedBytes / totalBytes) * 100);
                        onProgress(percentage, `Downloading browser component... ${percentage}%`);
                    }
                }
            });

            console.log(`[BrowserManager] Browser available at: ${installedBrowser.executablePath}`);
            return installedBrowser.executablePath;

        } catch (error) {
            console.error('[BrowserManager] Failed to setup browser:', error);
            throw error;
        }
    }
}

export const browserManager = PuppeteerBrowserManager.getInstance();
