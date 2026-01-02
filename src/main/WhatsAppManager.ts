import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { BrowserWindow, app } from 'electron';
import * as qrcode from 'qrcode-terminal';
import { MessageReceiverWorker } from './workers/MessageReceiverWorker';
import path from 'path';
import fs from 'fs';
import { browserManager } from './services/PuppeteerBrowserManager';

/**
 * WhatsAppManager - Core WhatsApp client manager
 * Handles connection, authentication, and message operations
 */
export class WhatsAppManager {
    private client: Client | null = null;
    private mainWindow: BrowserWindow | null = null;
    private status: 'disconnected' | 'connecting' | 'ready' = 'disconnected';
    private messageReceiverWorker: MessageReceiverWorker | null = null;

    // File cache to avoid re-downloading the same asset URL during a session
    private fileCache: Map<string, string> = new Map();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.initializeClient();
    }

    /**
     * Set the MessageReceiverWorker
     */
    setMessageReceiverWorker(worker: MessageReceiverWorker) {
        this.messageReceiverWorker = worker;
    }

    /**
     * Get the correct executable path for Puppeteer in production
     */


    /**
     * Initialize WhatsApp client with LocalAuth strategy
     */
    private async initializeClient(): Promise<void> {
        try {
            console.log('[WhatsAppManager] Initializing client...');

            const executablePath = await browserManager.getExecutablePath(
                (progress, msg) => console.log(`[WhatsAppManager] Browser Setup: ${msg} (${progress}%)`)
            );

            // Puppeteer configuration
            const puppeteerConfig: any = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            };

            // Set executablePath if we found it
            if (executablePath) {
                puppeteerConfig.executablePath = executablePath;
            }

            console.log('[WhatsAppManager] Puppeteer config:', JSON.stringify(puppeteerConfig, null, 2));

            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: this.getSessionDataPath()
                }),
                puppeteer: puppeteerConfig,
                // Fix for "sendIq called before startComms" - pinning to a known stable remote version
                // Using wppconnect-team's archive to ensure stability
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2407.3.html'
                }
            });

            this.setupEventHandlers();
        } catch (error) {
            console.error('[WhatsAppManager] Error initializing client:', error);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
        }
    }

    /**
     * Setup event handlers for WhatsApp client
     */
    private setupEventHandlers(): void {
        if (!this.client) return;

        // QR Code event
        this.client.on('qr', (qr: string) => {
            console.log('[WhatsAppManager] QR Code received');

            // Display QR in terminal for debugging
            qrcode.generate(qr, { small: true });

            // Send QR to renderer
            if (this.mainWindow) {
                this.mainWindow.webContents.send('whatsapp:qr-code', qr);
            }

            this.status = 'connecting';
            this.broadcastStatus('connecting');
        });

        // Ready event
        this.client.on('ready', () => {
            console.log('[WhatsAppManager] Client is ready!');
            this.status = 'ready';
            this.broadcastStatus('ready');
        });

        // Authenticated event
        this.client.on('authenticated', () => {
            console.log('[WhatsAppManager] Client authenticated');
            // Some whatsapp-web.js versions don't fire 'ready' properly with webVersionCache
            // Set a fallback timeout to force 'ready' status
            setTimeout(() => {
                if (this.status !== 'ready') {
                    console.log('[WhatsAppManager] Fallback: Setting status to ready after authentication');
                    this.status = 'ready';
                    this.broadcastStatus('ready');
                }
            }, 5000); // 5 second fallback
        });

        // Authentication failure event
        this.client.on('auth_failure', (msg) => {
            console.error('[WhatsAppManager] Authentication failed:', msg);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');

            if (this.mainWindow) {
                this.mainWindow.webContents.send('whatsapp:error', {
                    type: 'auth_failure',
                    message: 'Authentication failed. Please try again.'
                });
            }
        });

        // Disconnected event
        this.client.on('disconnected', (reason) => {
            console.log('[WhatsAppManager] Client disconnected:', reason);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
        });

        // Loading screen event
        this.client.on('loading_screen', (percent, message) => {
            console.log(`[WhatsAppManager] Loading... ${percent}% - ${message}`);
        });

        // Message received event - using 'message_create' to capture ALL messages
        // including messages sent from your own phone (e.g., replying from phone)
        // 'message' event ONLY captures incoming messages from others
        this.client.on('message_create', async (message: Message) => {
            // Determine the remote chat ID (who we are talking to)
            // If from me, target is 'to'. If from other, target is 'from'.
            const remoteChatId = message.fromMe ? message.to : message.from;

            // 1. FILTER: Ignore Group and Broadcast messages
            // We only support individual chats for now
            if (remoteChatId.endsWith('@g.us') || remoteChatId.endsWith('@broadcast')) {
                // Only log if it's not a status update (broadcast) which can be spammy
                if (!remoteChatId.includes('status')) {
                    // console.log('[WhatsAppManager] Skipping group/channel message:', remoteChatId);
                }
                return;
            }

            // 2. LOGGING
            console.log(`[WhatsAppManager] Message received (FromMe: ${message.fromMe}): ${remoteChatId}`);

            // Note: We used to skip fromMe messages to avoid duplicates with local inserts.
            // However, relying on this event ensures we get the *real* WhatsApp Message ID and timestamp.
            // The frontend/service should handle "upsert" logic to avoid duplication if it already saved a temporary version.

            // Forward to MessageReceiverWorker
            if (this.messageReceiverWorker) {
                await this.messageReceiverWorker.handleIncomingMessage(message);
            } else {
                // Fallback broadcast if worker not set
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('whatsapp:message-received', {
                        id: message.id._serialized,
                        from: message.from,
                        to: message.to,
                        body: message.body,
                        type: message.type,
                        timestamp: message.timestamp,
                        hasMedia: message.hasMedia,
                        fromMe: message.fromMe
                    });
                }
            }
        });
    }

    /**
     * Connect to WhatsApp
     */
    /**
     * Connect to WhatsApp
     * @param force - Force a fresh connection (kill old browser/session)
     */
    async connect(force: boolean = false): Promise<boolean> {
        try {
            // 1. Check existing states
            if (this.status === 'ready') {
                if (force) {
                    console.log('[WhatsAppManager] Force connect requested while ready. Disconnecting first...');
                    // Optional: disconnect first if you want to support "Restart" behavior
                    // For now, let's assume if it's ready, we might want to check if it's responsive? 
                    // But per user request "connected gak masalah", we can skip.
                    // However, if user clicks "Connect" maybe they know it's broken. 
                    // Let's rely on the "stuck" part.
                    // If user clicks Connect, they probably want to verify connection. 
                    // Let's blindly trust 'ready' for now to avoid accidental disconnects, 
                    // unless we want to be strict.
                    // User said: "kecuali background proses emang udah connecting dan connected gak masalah"
                    // So if connected, we leave it.
                    console.log('[WhatsAppManager] Already connected. Skipping force connect.');
                    return true;
                }
                console.log('[WhatsAppManager] Already connected');
                return true;
            }

            if (this.status === 'connecting') {
                if (!force) {
                    console.log('[WhatsAppManager] Already connecting. Background process active.');
                    return false;
                }
                console.warn('[WhatsAppManager] Connection in progress but Force requested. Killing old session...');
            }

            console.log(`[WhatsAppManager] Starting connection (Force: ${force})...`);

            // 2. Set status
            this.status = 'connecting';
            this.broadcastStatus('connecting');

            // 3. Force Reset: Destroy existing client/browser
            if (this.client) {
                try {
                    console.log('[WhatsAppManager] Destroying previous client...');
                    await this.client.destroy();
                } catch (e) {
                    console.warn('[WhatsAppManager] Error destroying client:', e);
                }
                this.client = null;
            }

            // 4. Initialize new Client
            await this.initializeClient();

            if (!this.client) {
                throw new Error('Failed to initialize WhatsApp client');
            }

            // 5. Attempt connection with Retry Logic
            try {
                await (this.client as Client).initialize();
            } catch (initError: any) {
                // Handle "Execution context was destroyed" / "Protocol error"
                if (initError.message && (
                    initError.message.includes('Execution context was destroyed') ||
                    initError.message.includes('Protocol error')
                )) {
                    console.warn('[WhatsAppManager] Protocol error during init. Retrying in 2s...', initError.message);

                    // Cleanup failed attempt
                    if (this.client) {
                        try { await (this.client as Client).destroy(); } catch (_) { }
                    }
                    this.client = null;

                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Retry once
                    await this.initializeClient();

                    // TS Workaround: explicit check
                    if (this.client) {
                        console.log('[WhatsAppManager] Retrying initialization...');
                        await (this.client as Client).initialize();
                    } else {
                        throw new Error('Failed to re-initialize client during retry');
                    }
                } else {
                    throw initError;
                }
            }

            return true;
        } catch (error: any) {
            console.error('[WhatsAppManager] Connection error:', error);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');

            if (this.mainWindow) {
                this.mainWindow.webContents.send('whatsapp:error', {
                    type: 'connection_error',
                    message: error instanceof Error ? error.message : 'Unknown connection error'
                });
            }
            throw error;
        }
    }

    /**
     * Get session data path
     */
    private getSessionDataPath(): string {
        return app.isPackaged
            ? path.join(app.getPath('userData'), '.wwebjs_auth')
            : '.wwebjs_auth';
    }

    /**
     * Delete session data directory
     */
    private deleteSessionData(): void {
        const sessionPath = this.getSessionDataPath();
        const authPath = path.resolve(sessionPath, 'session'); // LocalAuth creates a 'session' subdir

        console.log(`[WhatsAppManager] Deleting session data at: ${sessionPath}`);

        try {
            // Delete the specific session folder created by LocalAuth
            // Note: LocalAuth uses clientId 'session' by default if not specified
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('[WhatsAppManager] Session directory deleted successfully');
            } else if (fs.existsSync(sessionPath)) {
                // Fallback: try to delete the root auth folder if the specific session folder isn't found
                // This might be safer to avoid deleting other sessions if we had multiple
                // But since we use default, let's just clean up what we can.
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('[WhatsAppManager] Auth directory deleted successfully');
            }
        } catch (error) {
            console.error('[WhatsAppManager] Failed to delete session data:', error);
        }
    }

    /**
     * Disconnect from WhatsApp
     */
    async disconnect(): Promise<void> {
        try {
            console.log('[WhatsAppManager] Disconnecting...');

            if (this.client) {
                // Try to logout nicely first to notify WhatsApp server
                if (this.status === 'ready') {
                    try {
                        await this.client.logout();
                        console.log('[WhatsAppManager] Logged out from WhatsApp');
                    } catch (logoutError) {
                        console.warn('[WhatsAppManager] Logout failed (ignoring):', logoutError);
                    }
                }

                await this.client.destroy();
                this.client = null;
            }

            this.status = 'disconnected';
            this.broadcastStatus('disconnected');

            // Clear file cache
            this.clearFileCache();

            // critical: delete session files to force re-scan
            this.deleteSessionData();

            // Re-initialize client so it can be connected again
            this.initializeClient();
        } catch (error) {
            console.error('[WhatsAppManager] Disconnect error:', error);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
            throw error;
        }
    }

    /**
     * Check if a local session exists
     */
    hasExistingSession(): boolean {
        const sessionPath = this.getSessionDataPath();
        const authPath = path.resolve(sessionPath, 'session');

        // Check if session directory exists and is not empty
        try {
            if (fs.existsSync(authPath)) {
                const files = fs.readdirSync(authPath);
                return files.length > 0;
            }
            if (fs.existsSync(sessionPath)) {
                // Fallback check for root folder (though LocalAuth usually makes a subdir)
                const files = fs.readdirSync(sessionPath);
                return files.length > 0;
            }
            return false;
        } catch (error) {
            console.error('[WhatsAppManager] Error checking session existence:', error);
            return false;
        }
    }

    /**
     * Format phone number to WhatsApp ID format
     * Handles:
     * - Removing non-numeric characters
     * - Replacing leading '0' with '62' (Indonesia)
     * - Appending '@c.us'
     */
    private formatPhoneNumber(phone: string): string {
        // 1. Remove all non-numeric characters
        let formatted = phone.replace(/\D/g, '');

        // 2. Handle leading '0' -> '62'
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        }

        // 3. Append suffix if not present
        if (!formatted.endsWith('@c.us')) {
            formatted += '@c.us';
        }

        return formatted;
    }

    /**
     * Download a file from URL to temporary directory with retry mechanism and caching
     * @param url - URL of the file to download
     * @param maxRetries - Maximum number of retries (default: 3)
     * @returns Path to the downloaded file
     */
    private async downloadFile(url: string, maxRetries = 3): Promise<string> {
        // Check cache first
        const cachedPath = this.fileCache.get(url);
        if (cachedPath && fs.existsSync(cachedPath)) {
            console.log(`[WhatsAppManager] Using cached file for: ${url}`);
            return cachedPath;
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const filePath = await this._downloadFileInternal(url);
                // Cache the downloaded file path
                this.fileCache.set(url, filePath);
                console.log(`[WhatsAppManager] File cached for URL: ${url}`);
                return filePath;
            } catch (error) {
                console.warn(`[WhatsAppManager] Download attempt ${attempt + 1}/${maxRetries} failed:`, error);
                if (attempt === maxRetries - 1) throw error;
                // Exponential backoff: 1s, 2s, 4s...
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
        throw new Error(`Failed to download file after ${maxRetries} attempts`);
    }

    /**
     * Internal implementation of file download
     */
    private async _downloadFileInternal(url: string): Promise<string> {
        const https = await import('https');
        const http = await import('http');
        const fsAsync = await import('fs');
        const pathModule = await import('path');
        const os = await import('os');

        return new Promise((resolve, reject) => {
            try {
                // Generate temp file path
                const tempDir = os.tmpdir();
                const fileName = `whatsapp_media_${Date.now()}_${pathModule.basename(url).split('?')[0]}`;
                const tempFilePath = pathModule.join(tempDir, fileName);

                console.log(`[WhatsAppManager] Downloading to: ${tempFilePath}`);

                // Choose http or https based on URL
                const client = url.startsWith('https://') ? https : http;

                const file = fsAsync.createWriteStream(tempFilePath);

                client.get(url, (response) => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                        return;
                    }

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log(`[WhatsAppManager] Download complete: ${tempFilePath}`);
                        resolve(tempFilePath);
                    });

                    file.on('error', (err) => {
                        fsAsync.unlink(tempFilePath, () => { }); // Delete the file on error
                        reject(err);
                    });
                }).on('error', (err) => {
                    fsAsync.unlink(tempFilePath, () => { }); // Delete the file on error
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Clear the file cache and delete cached files
     */
    clearFileCache(): void {
        console.log(`[WhatsAppManager] Clearing file cache (${this.fileCache.size} files)`);
        for (const [, filePath] of this.fileCache.entries()) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[WhatsAppManager] Deleted cached file: ${filePath}`);
                }
            } catch (error) {
                console.warn(`[WhatsAppManager] Failed to delete cached file: ${filePath}`, error);
            }
        }
        this.fileCache.clear();
    }

    /**
     * Send text message
     * @param to - Phone number with country code (e.g., "6281234567890@c.us")
     * @param content - Message content
     */
    async sendMessage(to: string, content: string): Promise<boolean> {
        try {
            if (!this.client || this.status !== 'ready') {
                throw new Error('WhatsApp client is not ready');
            }

            // Format phone number
            const chatId = this.formatPhoneNumber(to);
            console.log(`[WhatsAppManager] Sending message to ${to} (formatted: ${chatId})`);

            // Verify if the user is registered on WhatsApp
            const isRegistered = await this.client.isRegisteredUser(chatId);
            if (!isRegistered) {
                console.warn(`[WhatsAppManager] User ${to} is not registered on WhatsApp.`);
                throw new Error(`User ${to} is not registered on WhatsApp`);
            }

            await this.client.sendMessage(chatId, content);
            console.log(`[WhatsAppManager] Message sent successfully to ${to}`);

            return true;
        } catch (error) {
            console.error('[WhatsAppManager] Send message error:', error);
            throw error;
        }
    }

    /**
     * Send message with media
     * @param to - Phone number with country code
     * @param content - Message content
     * @param mediaPath - Path to media file or URL
     */
    async sendMessageWithMedia(
        to: string,
        content: string,
        mediaPath: string
    ): Promise<boolean> {
        try {
            if (!this.client || this.status !== 'ready') {
                throw new Error('WhatsApp client is not ready');
            }

            // Format phone number
            const chatId = this.formatPhoneNumber(to);
            console.log(`[WhatsAppManager] Sending media message to ${to} (formatted: ${chatId})`);

            // Verify if the user is registered on WhatsApp
            const isRegistered = await this.client.isRegisteredUser(chatId);
            if (!isRegistered) {
                console.warn(`[WhatsAppManager] User ${to} is not registered on WhatsApp.`);
                throw new Error(`User ${to} is not registered on WhatsApp`);
            }

            // Download or resolve file
            let media: MessageMedia;
            let localFilePath: string;

            // Check if mediaPath is a URL
            if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
                console.log(`[WhatsAppManager] Downloading remote file: ${mediaPath}`);
                // downloadFile now uses cache internally
                localFilePath = await this.downloadFile(mediaPath);
                media = MessageMedia.fromFilePath(localFilePath);
            } else {
                // Local file path
                localFilePath = mediaPath;
                media = MessageMedia.fromFilePath(mediaPath);
            }

            // Calculate approximate size from Base64 (3/4 of length)
            const sizeInBytes = Math.ceil((media.data.length * 3) / 4);
            const sizeInMB = sizeInBytes / (1024 * 1024);
            console.log(`[WhatsAppManager] Prepared media: ${media.mimetype}, Size: ${sizeInMB.toFixed(2)}MB`);

            // Safety check for Puppeteer limit (approx 50MB is often risky for evaluate)
            if (sizeInMB > 50) {
                console.warn(`[WhatsAppManager] File size ${sizeInMB.toFixed(2)}MB is near Puppeteer limit`);
            }

            // Determine sending mode based on mime type
            const mimeType = media.mimetype;
            let sendMediaAsDocument = true; // Default to document for safety

            // Images (jpg, png, webp) -> Send as Picture (not document)
            if (mimeType.startsWith('image/')) {
                sendMediaAsDocument = false;
                console.log(`[WhatsAppManager] Detected Image (${mimeType}) -> Sending as Picture`);
            }
            // Videos (mp4) -> Send as Video (not document)
            else if (mimeType.startsWith('video/')) {
                sendMediaAsDocument = false;
                console.log(`[WhatsAppManager] Detected Video (${mimeType}) -> Sending as Video`);
            }
            // PDF and others -> Send as Document
            else {
                console.log(`[WhatsAppManager] Detected Document (${mimeType}) -> Sending as Document`);
            }

            const sendOptions = { caption: content, sendMediaAsDocument: sendMediaAsDocument };

            await this.client.sendMessage(chatId, media, sendOptions);
            console.log(`[WhatsAppManager] Media message sent successfully to ${to}`);

            return true;
        } catch (error: any) {
            console.error('[WhatsAppManager] Send media message error:', error);

            // Check for specific Puppeteer evaluation error which usually means file too large
            if (error.message && error.message.includes('Evaluation failed')) {
                throw new Error(`Failed to send media: File may be too large or format unsupported. (Internal: ${error.message})`);
            }
            throw error;
        }
    }

    /**
     * Get current status
     */
    getStatus(): 'disconnected' | 'connecting' | 'ready' {
        return this.status;
    }

    /**
     * Check if client is ready
     */
    isReady(): boolean {
        return this.status === 'ready' && this.client !== null;
    }

    /**
     * Broadcast status change to renderer
     */
    private broadcastStatus(status: string): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('whatsapp:status-change', status);
        }
    }

    /**
     * Get client info (for debugging)
     */
    async getClientInfo(): Promise<any> {
        try {
            if (!this.client || this.status !== 'ready') {
                return null;
            }

            const info = this.client.info;
            return {
                wid: info.wid._serialized,
                pushname: info.pushname,
                platform: info.platform
            };
        } catch (error) {
            console.error('[WhatsAppManager] Get client info error:', error);
            return null;
        }
    }
}
