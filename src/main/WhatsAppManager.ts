import * as Baileys from '@whiskeysockets/baileys';
import { BrowserWindow, app } from 'electron';
import * as qrcode from 'qrcode-terminal';
import { MessageReceiverWorker } from './workers/MessageReceiverWorker';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const BaileysLib = Baileys as any;
// Robust resolution of makeWASocket function
const makeWASocket = BaileysLib.makeWASocket || BaileysLib.default || BaileysLib;

// Prepare other exports with fallbacks
const DisconnectReason = BaileysLib.DisconnectReason || BaileysLib.default?.DisconnectReason;
const useMultiFileAuthState = BaileysLib.useMultiFileAuthState || BaileysLib.default?.useMultiFileAuthState;
const Browsers = BaileysLib.Browsers || BaileysLib.default?.Browsers;
const fetchLatestBaileysVersion = BaileysLib.fetchLatestBaileysVersion || BaileysLib.default?.fetchLatestBaileysVersion;

// Types
type WASocket = Baileys.WASocket;
type AnyMessageContent = Baileys.AnyMessageContent;

// Suppress Baileys verbose logging in production
// Pino might also check for default export in some envs
const pinoLogger = (pino as any).default || pino;
const logger = pinoLogger({ level: 'silent' });

type ConnectionStatus = 'disconnected' | 'connecting' | 'ready';

/**
 * WhatsAppManager - Core WhatsApp client manager using Baileys
 * Handles connection, authentication, and message operations
 */
export class WhatsAppManager {
    private sock: WASocket | null = null;
    private mainWindow: BrowserWindow | null = null;
    private messageReceiverWorker: MessageReceiverWorker | null = null;
    private status: ConnectionStatus = 'disconnected';
    private isReconnecting: boolean = false;
    private _qrCodeData: string | null = null; // Stored for potential future use

    // File download cache
    private fileCache: Map<string, string> = new Map();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    /**
     * Set the MessageReceiverWorker
     */
    setMessageReceiverWorker(worker: MessageReceiverWorker): void {
        this.messageReceiverWorker = worker;
    }

    /**
     * Broadcast status to renderer process
     */
    private broadcastStatus(status: string): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('whatsapp:status-change', status);
        }
    }

    /**
     * Get session data path for Baileys auth
     */
    getSessionDataPath(): string {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, 'baileys_auth');
    }

    /**
     * Check if a local session exists
     */
    hasExistingSession(): boolean {
        const sessionPath = this.getSessionDataPath();
        const credsPath = path.join(sessionPath, 'creds.json');
        return fs.existsSync(credsPath);
    }

    /**
     * Delete session data directory
     */
    deleteSessionData(): void {
        const sessionPath = this.getSessionDataPath();
        console.log(`[WhatsAppManager] Deleting session data at: ${sessionPath}`);
        try {
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('[WhatsAppManager] Session data deleted successfully');
            }
        } catch (error) {
            console.error('[WhatsAppManager] Failed to delete session data:', error);
        }
    }

    /**
     * Connect to WhatsApp using Baileys
     */
    async connect(force: boolean = false): Promise<boolean> {
        try {
            if (this.status === 'ready' && !force) {
                console.log('[WhatsAppManager] Already connected');
                return true;
            }

            if (this.status === 'connecting' && !force) {
                console.log('[WhatsAppManager] Already connecting...');
                return false;
            }

            console.log(`[WhatsAppManager] Starting Baileys connection (Force: ${force})...`);
            this.status = 'connecting';
            this.broadcastStatus('connecting');

            // Get auth state
            const sessionPath = this.getSessionDataPath();
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            // Get latest Baileys version
            const { version } = await fetchLatestBaileysVersion();
            console.log(`[WhatsAppManager] Using Baileys version: ${version.join('.')}`);

            // Create Baileys socket
            this.sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false, // We handle QR ourselves
                logger,
                browser: Browsers.windows('Desktop'),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false, // Don't sync full history for performance
            });

            // Setup event handlers
            this.setupEventHandlers(saveCreds);

            return true;
        } catch (error: any) {
            console.error('[WhatsAppManager] Connection error:', error);
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');

            if (this.mainWindow) {
                // Check for specific functional errors
                const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
                console.error(`[WhatsAppManager] Detailed error:`, error);

                this.mainWindow.webContents.send('whatsapp:error', {
                    type: 'connection_error',
                    message: errorMessage
                });
            }
            throw error;
        }
    }

    /**
     * Setup Baileys event handlers
     */
    private setupEventHandlers(saveCreds: () => Promise<void>): void {
        if (!this.sock) return;

        // Connection update events
        this.sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            // Handle QR code
            if (qr) {
                console.log('[WhatsAppManager] QR Code received');
                this._qrCodeData = qr;

                // Display in terminal for debugging
                qrcode.generate(qr, { small: true });

                // Send to renderer
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('whatsapp:qr-code', qr);
                }

                this.status = 'connecting';
                this.broadcastStatus('connecting');
            }

            // Handle connection state changes
            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`[WhatsAppManager] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

                this.status = 'disconnected';
                this.broadcastStatus('disconnected');

                if (statusCode === DisconnectReason.loggedOut) {
                    // User logged out - clear session
                    console.log('[WhatsAppManager] Logged out, clearing session data');
                    this.deleteSessionData();

                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('whatsapp:error', {
                            type: 'logged_out',
                            message: 'Logged out from WhatsApp. Please scan QR code again.'
                        });
                    }
                } else if (shouldReconnect && !this.isReconnecting) {
                    // Auto-reconnect after a delay
                    this.isReconnecting = true;
                    console.log('[WhatsAppManager] Attempting auto-reconnect in 3 seconds...');

                    setTimeout(async () => {
                        try {
                            await this.connect(true);
                        } catch (err) {
                            console.error('[WhatsAppManager] Auto-reconnect failed:', err);
                        }
                        this.isReconnecting = false;
                    }, 3000);
                }
            } else if (connection === 'open') {
                console.log('[WhatsAppManager] Client is ready!');
                this.status = 'ready';
                this._qrCodeData = null;
                this.broadcastStatus('ready');

                // Clear reconnecting flag
                this.isReconnecting = false;

                // Notify renderer
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('whatsapp:ready');
                }
            }
        });

        // Credentials update - save to disk
        this.sock.ev.on('creds.update', saveCreds);

        // Incoming messages
        this.sock.ev.on('messages.upsert', async (m: any) => {
            console.log(`[WhatsAppManager] messages.upsert type: ${m.type}, count: ${m.messages.length}`);

            // Allow 'notify' (realtime) and 'append' (history)
            if (m.type !== 'notify' && m.type !== 'append') return;

            for (const msg of m.messages) {
                // Log for debug
                // console.log('[WhatsAppManager] Processing message:', msg.key.id);

                const remoteJid = msg.key.remoteJid;
                // Only allow personal chats (one-on-one)
                // Filter out: @g.us (groups), @broadcast, @newsletter (channels)
                if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net')) continue;

                // Extract content
                let body = '';
                let type = 'unknown';
                let hasMedia = false;

                if (msg.message) {
                    type = Object.keys(msg.message)[0];
                    // Simple content extraction strategies
                    body = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message.imageMessage?.caption ||
                        msg.message.videoMessage?.caption ||
                        "";

                    if (type === 'imageMessage' || type === 'videoMessage' || type === 'documentMessage' || type === 'audioMessage' || type === 'stickerMessage') {
                        hasMedia = true;
                    }
                }

                // Construct clean payload for renderer
                const payload = {
                    id: msg.key.id,
                    from: remoteJid,
                    to: this.sock?.user?.id || 'me',
                    body: body,
                    type: type,
                    timestamp: typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp as any)?.low || Math.floor(Date.now() / 1000),
                    hasMedia: hasMedia,
                    fromMe: msg.key.fromMe || false,
                    pushName: msg.pushName
                };

                // Send to Renderer (Inbox/Frontend) for storage and display
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('whatsapp:message-received', payload);
                }

                // Pass to MessageReceiverWorker if needed (for other logic)
                if (this.messageReceiverWorker && !msg.key.fromMe) {
                    const messageData = {
                        key: msg.key,
                        message: msg.message,
                        messageTimestamp: msg.messageTimestamp,
                        pushName: msg.pushName,
                    };
                    this.messageReceiverWorker.handleIncomingMessage(messageData as any);
                }
            }
        });

        // Contact sync events
        this.sock.ev.on('contacts.upsert', (contacts: any[]) => {
            console.log(`[WhatsAppManager] Received ${contacts.length} contacts from WhatsApp`);

            // Map and send to renderer
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                const mappedContacts = contacts.map(c => ({
                    phone: c.id,
                    name: c.name || c.notify || c.verifiedName
                }));
                this.mainWindow.webContents.send('whatsapp:contacts-received', mappedContacts);
            }
        });
    }

    /**
     * Disconnect from WhatsApp
     */
    async disconnect(clearSession: boolean = false): Promise<void> {
        console.log(`[WhatsAppManager] Disconnecting... (Clear Session: ${clearSession})`);

        try {
            if (this.sock) {
                if (clearSession) {
                    // Logout completely
                    await this.sock.logout();
                } else {
                    // Just end connection
                    this.sock.end(undefined);
                }
                this.sock = null;
            }

            if (clearSession) {
                this.deleteSessionData();
            }

            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
            console.log('[WhatsAppManager] Disconnected successfully');
        } catch (error) {
            console.error('[WhatsAppManager] Disconnect error:', error);
            // Force cleanup anyway
            this.sock = null;
            this.status = 'disconnected';
            this.broadcastStatus('disconnected');
        }
    }

    /**
     * Format phone number to WhatsApp JID format
     */
    private formatPhoneNumber(phone: string): string {
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // Normalize Indonesian numbers
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }

        // Add @s.whatsapp.net suffix for personal chats
        return `${cleaned}@s.whatsapp.net`;
    }

    /**
     * Check if a number is registered on WhatsApp
     */
    async isRegisteredUser(phone: string): Promise<boolean> {
        if (!this.sock || this.status !== 'ready') {
            return false;
        }

        try {
            const jid = this.formatPhoneNumber(phone);
            const results = await this.sock.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
            return results?.[0]?.exists ?? false;
        } catch (error) {
            console.error('[WhatsAppManager] Error checking registration:', error);
            return false;
        }
    }

    /**
     * Get current QR Code data
     */
    getQRCode(): string | null {
        return this._qrCodeData;
    }

    /**
     * Send text message
     */
    async sendMessage(to: string, content: string): Promise<boolean> {
        try {
            if (!this.sock || this.status !== 'ready') {
                throw new Error('WhatsApp client is not ready');
            }

            const jid = this.formatPhoneNumber(to);

            // Check if registered
            const isRegistered = await this.isRegisteredUser(to);
            if (!isRegistered) {
                throw new Error(`User ${to} is not registered on WhatsApp`);
            }

            await this.sock.sendMessage(jid, { text: content });
            console.log(`[WhatsAppManager] Message sent to ${to}`);
            return true;
        } catch (error: any) {
            console.error('[WhatsAppManager] Send text error:', error);
            throw error;
        }
    }

    /**
     * Send media message
     */
    async sendMessageWithMedia(to: string, content: string, mediaPath: string): Promise<boolean> {
        try {
            if (!this.sock || this.status !== 'ready') {
                throw new Error('WhatsApp client is not ready');
            }

            const jid = this.formatPhoneNumber(to);

            // Check if registered
            const isRegistered = await this.isRegisteredUser(to);
            if (!isRegistered) {
                throw new Error(`User ${to} is not registered on WhatsApp`);
            }

            // Determine media type from extension
            const ext = path.extname(mediaPath).toLowerCase();
            let mediaBuffer: Buffer;
            let messageContent: AnyMessageContent;

            // Handle URL vs local file
            if (mediaPath.startsWith('http')) {
                const localPath = await this.downloadFile(mediaPath);
                mediaBuffer = fs.readFileSync(localPath);
            } else {
                mediaBuffer = fs.readFileSync(mediaPath);
            }

            // Determine content type
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                messageContent = {
                    image: mediaBuffer,
                    caption: content || undefined
                };
            } else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
                messageContent = {
                    video: mediaBuffer,
                    caption: content || undefined
                };
            } else if (['.mp3', '.ogg', '.m4a', '.wav'].includes(ext)) {
                messageContent = {
                    audio: mediaBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false // Set to true for voice note
                };
            } else {
                // Default to document
                const filename = path.basename(mediaPath);
                messageContent = {
                    document: mediaBuffer,
                    mimetype: 'application/octet-stream',
                    fileName: filename,
                    caption: content || undefined
                };
            }

            await this.sock.sendMessage(jid, messageContent);
            console.log(`[WhatsAppManager] Media message sent to ${to}`);
            return true;
        } catch (error: any) {
            console.error('[WhatsAppManager] Send media error:', error);
            throw error;
        }
    }

    /**
     * Download file from URL
     */
    private async downloadFile(url: string, maxRetries = 3): Promise<string> {
        // Check cache
        if (this.fileCache.has(url)) {
            const cachedPath = this.fileCache.get(url)!;
            if (fs.existsSync(cachedPath)) {
                return cachedPath;
            }
        }

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this._downloadFileInternal(url);
            } catch (error: any) {
                console.warn(`[WhatsAppManager] Download attempt ${attempt} failed:`, error.message);
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        throw lastError || new Error('Download failed');
    }

    /**
     * Internal download method
     */
    private async _downloadFileInternal(url: string): Promise<string> {
        const https = await import('https');
        const http = await import('http');

        return new Promise((resolve, reject) => {
            try {
                const protocol = url.startsWith('https') ? https : http;
                const tempDir = path.join(app.getPath('temp'), 'xenderin-media');

                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const urlObj = new URL(url);
                const ext = path.extname(urlObj.pathname) || '.bin';
                const filename = `media_${Date.now()}${ext}`;
                const tempFilePath = path.join(tempDir, filename);

                const file = fs.createWriteStream(tempFilePath);

                protocol.get(url, (response: any) => {
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        const redirectUrl = response.headers.location;
                        if (redirectUrl) {
                            this._downloadFileInternal(redirectUrl).then(resolve).catch(reject);
                            return;
                        }
                    }

                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        this.fileCache.set(url, tempFilePath);
                        resolve(tempFilePath);
                    });
                }).on('error', (err: Error) => {
                    fs.unlink(tempFilePath, () => { });
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Clear file cache
     */
    clearFileCache(): void {
        for (const [, filePath] of this.fileCache.entries()) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (error) { }
        }
        this.fileCache.clear();
    }

    /**
     * Get the status
     */
    getStatus(): ConnectionStatus {
        return this.status;
    }

    /**
     * Check if client is ready
     */
    isReady(): boolean {
        return this.status === 'ready' && this.sock !== null;
    }

    /**
     * Get client info (phone number, name, etc.)
     */
    async getClientInfo(): Promise<{ pushName?: string; phoneNumber?: string } | null> {
        if (!this.sock || this.status !== 'ready') {
            return null;
        }

        try {
            const user = this.sock.user;
            if (user) {
                return {
                    pushName: user.name,
                    phoneNumber: user.id.split('@')[0]
                };
            }
            return null;
        } catch (error) {
            console.error('[WhatsAppManager] Error getting client info:', error);
            return null;
        }
    }
}
