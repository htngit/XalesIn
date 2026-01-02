import { WhatsAppManager } from '../WhatsAppManager';
import { BrowserWindow, app } from 'electron';
import { Message } from 'whatsapp-web.js';
import fs from 'fs';
import path from 'path';

export class MessageReceiverWorker {
    // private whatsappManager: WhatsAppManager; // Removed unused property
    private mainWindow: BrowserWindow;
    private unsubscribeKeywords = ['unsubscribe', 'stop', 'batal', 'berhenti', 'jangan kirim', 'keluar', 'cancel'];

    constructor(_whatsappManager: WhatsAppManager, mainWindow: BrowserWindow) {
        // this.whatsappManager = whatsappManager;
        this.mainWindow = mainWindow;
        // Keep whatsappManager in constructor for future use and compatibility, but don't store it yet
    }

    /**
     * Handle incoming message from WhatsAppManager
     */
    async handleIncomingMessage(message: Message) {
        try {
            console.log('[MessageReceiverWorker] Processing incoming message from:', message.from);

            // Filter out non-personal chat messages
            // - Groups end with @g.us
            // - Broadcast lists end with @broadcast
            // - Status updates come from status@broadcast
            if (this.isNonPersonalChat(message.from)) {
                console.log('[MessageReceiverWorker] Skipping non-personal chat message from:', message.from);
                return;
            }

            // Validate phone number format
            const phoneNumber = this.extractPhoneNumber(message.from);
            if (!phoneNumber) {
                console.log('[MessageReceiverWorker] Invalid phone number format, skipping:', message.from);
                return;
            }

            const isUnsubscribe = this.isUnsubscribeRequest(message.body);

            // 1. Check for unsubscribe
            if (isUnsubscribe) {
                console.log('[MessageReceiverWorker] Unsubscribe request detected from:', message.from);

                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('whatsapp:unsubscribe-detected', {
                        phoneNumber: phoneNumber,
                        message: message.body,
                        timestamp: new Date().toISOString()
                    });
                }

                // Optional: Auto-reply confirming unsubscribe
                // Note: Will need whatsappManager for this in the future
            }

            // 2. Handle Media (Download if present)
            let mediaUrl: string | undefined;
            let mediaMimeType: string | undefined;

            if (message.hasMedia) {
                try {
                    console.log('[MessageReceiverWorker] Downloading media for message:', message.id._serialized);
                    const media = await message.downloadMedia();
                    if (media) {
                        // Create media directory if not exists
                        const mediaDir = path.join(app.getPath('userData'), 'media');
                        if (!fs.existsSync(mediaDir)) {
                            fs.mkdirSync(mediaDir, { recursive: true });
                        }

                        // Generate filename
                        const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
                        const filename = `${message.timestamp}-${message.id.id}.${extension}`;
                        const filePath = path.join(mediaDir, filename);

                        // Save file
                        fs.writeFileSync(filePath, media.data, 'base64');
                        console.log('[MessageReceiverWorker] Media saved to:', filePath);

                        // Set media URL for frontend (using custom protocol)
                        mediaUrl = `media://${filename}`;
                        mediaMimeType = media.mimetype;
                    }
                } catch (mediaError) {
                    console.error('[MessageReceiverWorker] Failed to download media:', mediaError);
                }
            }

            // 3. Broadcast to Renderer with cleaned phone number
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('whatsapp:message-received', {
                    id: message.id._serialized,
                    from: phoneNumber + '@c.us', // Use cleaned phone number
                    to: message.to,
                    body: message.body,
                    type: message.type,
                    timestamp: message.timestamp,
                    hasMedia: message.hasMedia,
                    mediaUrl: mediaUrl,
                    mediaMimeType: mediaMimeType,
                    isUnsubscribeRequest: isUnsubscribe
                });
            }
        } catch (error) {
            console.error('[MessageReceiverWorker] Error handling message:', error);
        }
    }

    /**
     * Check if the message is from a non-personal chat (group, broadcast, status, channel)
     */
    private isNonPersonalChat(from: string): boolean {
        if (!from) return true;

        // Only allow personal chats that end with @c.us
        // This filters out:
        // - Group chats (@g.us)
        // - Broadcast lists (@broadcast)
        // - Channels/Newsletters (@newsletter)
        // - Status updates (status@broadcast)
        // - Any other unknown formats
        if (!from.endsWith('@c.us')) {
            return true;
        }

        return false;
    }

    /**
     * Extract and validate phone number from WhatsApp ID
     * Returns null if invalid
     */
    private extractPhoneNumber(from: string): string | null {
        if (!from) return null;

        // Remove @c.us suffix and any non-digit characters
        const phoneNumber = from.replace('@c.us', '').replace(/[^\d]/g, '');

        // Validate phone number length (typical range: 8-15 digits)
        // Indonesia: 62 + 9-12 digits = 11-14 digits total
        if (phoneNumber.length < 8 || phoneNumber.length > 15) {
            console.log('[MessageReceiverWorker] Phone number length invalid:', phoneNumber.length, 'digits');
            return null;
        }

        return phoneNumber;
    }

    /**
     * Check if message content contains unsubscribe keywords
     */
    private isUnsubscribeRequest(content: string): boolean {
        if (!content) return false;
        const lowerContent = content.toLowerCase();
        return this.unsubscribeKeywords.some(keyword => lowerContent.includes(keyword));
    }
}
