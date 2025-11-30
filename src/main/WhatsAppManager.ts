import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { BrowserWindow } from 'electron';
import * as qrcode from 'qrcode-terminal';

/**
 * WhatsAppManager - Core WhatsApp client manager
 * Handles connection, authentication, and message operations
 */
export class WhatsAppManager {
    private client: Client | null = null;
    private mainWindow: BrowserWindow | null = null;
    private status: 'disconnected' | 'connecting' | 'ready' = 'disconnected';

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.initializeClient();
    }

    /**
     * Initialize WhatsApp client with LocalAuth strategy
     */
    private initializeClient(): void {
        try {
            console.log('[WhatsAppManager] Initializing client...');

            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: '.wwebjs_auth'
                }),
                puppeteer: {
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
            // Don't change status here, wait for 'ready' event
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

        // Message received event (for future MessageReceiverWorker)
        this.client.on('message', async (message: Message) => {
            console.log('[WhatsAppManager] Message received:', message.from);

            // Broadcast to renderer
            if (this.mainWindow) {
                this.mainWindow.webContents.send('whatsapp:message-received', {
                    id: message.id._serialized,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    type: message.type,
                    timestamp: message.timestamp,
                    hasMedia: message.hasMedia
                });
            }
        });
    }

    /**
     * Connect to WhatsApp
     */
    async connect(): Promise<boolean> {
        try {
            console.log('[WhatsAppManager] Connecting...');

            if (!this.client) {
                throw new Error('Client not initialized');
            }

            // Don't initialize if already ready
            if (this.status === 'ready') {
                console.log('[WhatsAppManager] Already connected');
                return true;
            }

            // Reset status to connecting before initializing
            this.status = 'connecting';
            this.broadcastStatus('connecting');

            await this.client.initialize();
            return true;
        } catch (error) {
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
     * Disconnect from WhatsApp
     */
    async disconnect(): Promise<void> {
        try {
            console.log('[WhatsAppManager] Disconnecting...');

            if (this.client) {
                await this.client.destroy();
                this.client = null;
            }

            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
        } catch (error) {
            console.error('[WhatsAppManager] Disconnect error:', error);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
            throw error;
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
     * Download a file from URL to temporary directory
     * @param url - URL of the file to download
     * @returns Path to the downloaded file
     */
    private async downloadFile(url: string): Promise<string> {
        const https = await import('https');
        const http = await import('http');
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        return new Promise((resolve, reject) => {
            try {
                // Generate temp file path
                const tempDir = os.tmpdir();
                const fileName = `whatsapp_media_${Date.now()}_${path.basename(url).split('?')[0]}`;
                const tempFilePath = path.join(tempDir, fileName);

                console.log(`[WhatsAppManager] Downloading to: ${tempFilePath}`);

                // Choose http or https based on URL
                const client = url.startsWith('https://') ? https : http;

                const file = fs.createWriteStream(tempFilePath);

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
                        fs.unlink(tempFilePath, () => { }); // Delete the file on error
                        reject(err);
                    });
                }).on('error', (err) => {
                    fs.unlink(tempFilePath, () => { }); // Delete the file on error
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
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
        let tempFilePath: string | null = null;

        try {
            if (!this.client || this.status !== 'ready') {
                throw new Error('WhatsApp client is not ready');
            }

            // Format phone number
            const chatId = this.formatPhoneNumber(to);
            console.log(`[WhatsAppManager] Sending media message to ${to} (formatted: ${chatId})`);

            let media: MessageMedia;

            // Check if mediaPath is a URL
            if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
                console.log(`[WhatsAppManager] Downloading remote file: ${mediaPath}`);
                tempFilePath = await this.downloadFile(mediaPath);
                media = MessageMedia.fromFilePath(tempFilePath);
            } else {
                // Local file path
                media = MessageMedia.fromFilePath(mediaPath);
            }

            await this.client.sendMessage(chatId, media, { caption: content });
            console.log(`[WhatsAppManager] Media message sent successfully to ${to}`);

            return true;
        } catch (error) {
            console.error('[WhatsAppManager] Send media message error:', error);
            throw error;
        } finally {
            // Clean up temp file if it was created
            if (tempFilePath) {
                try {
                    const fs = await import('fs');
                    fs.unlinkSync(tempFilePath);
                    console.log(`[WhatsAppManager] Cleaned up temp file: ${tempFilePath}`);
                } catch (cleanupError) {
                    console.warn(`[WhatsAppManager] Failed to clean up temp file: ${tempFilePath}`, cleanupError);
                }
            }
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
        if (this.mainWindow) {
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
