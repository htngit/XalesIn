import { WhatsAppManager } from '../WhatsAppManager';
import { BrowserWindow, app } from 'electron';
import {
    proto,
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

/**
 * Simplified message structure from WhatsAppManager
 */
interface BaileysMessageData {
    key: proto.IMessageKey;
    message: proto.IMessage | null | undefined;
    messageTimestamp: number | Long | null | undefined;
    pushName?: string | null;
}

export class MessageReceiverWorker {
    private mainWindow: BrowserWindow;
    private unsubscribeKeywords = ['unsubscribe', 'stop', 'batal', 'berhenti', 'jangan kirim', 'keluar', 'cancel'];

    constructor(_whatsappManager: WhatsAppManager, mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    /**
     * Handle incoming message from WhatsAppManager (Baileys format)
     */
    async handleIncomingMessage(messageData: BaileysMessageData) {
        try {
            const { key, message, messageTimestamp, pushName } = messageData;
            const remoteJid = key.remoteJid;

            if (!remoteJid) return;

            console.log('[MessageReceiverWorker] Processing incoming message from:', remoteJid);

            // Filter out non-personal chat messages
            if (this.isNonPersonalChat(remoteJid)) {
                console.log('[MessageReceiverWorker] Skipping non-personal chat message from:', remoteJid);
                return;
            }

            // Validate phone number format
            const phoneNumber = this.extractPhoneNumber(remoteJid);
            if (!phoneNumber) {
                console.log('[MessageReceiverWorker] Invalid phone number format, skipping:', remoteJid);
                return;
            }

            // Extract message body
            const body = this.extractMessageBody(message);
            const isUnsubscribe = this.isUnsubscribeRequest(body);

            // Check for unsubscribe
            if (isUnsubscribe) {
                console.log('[MessageReceiverWorker] Unsubscribe request detected from:', remoteJid);

                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('whatsapp:unsubscribe-detected', {
                        phoneNumber: phoneNumber,
                        message: body,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Handle Media
            let mediaUrl: string | undefined;
            let mediaMimeType: string | undefined;
            const hasMedia = this.hasMediaContent(message);

            if (hasMedia && message) {
                try {
                    console.log('[MessageReceiverWorker] Processing media for message');
                    const mediaInfo = await this.processMediaMessage(messageData);
                    if (mediaInfo) {
                        mediaUrl = mediaInfo.url;
                        mediaMimeType = mediaInfo.mimeType;
                    }
                } catch (mediaError) {
                    console.error('[MessageReceiverWorker] Failed to process media:', mediaError);
                }
            }

            // Get timestamp
            const timestamp = typeof messageTimestamp === 'number'
                ? messageTimestamp
                : (messageTimestamp as any)?.toNumber?.() ?? Date.now() / 1000;

            // Broadcast to Renderer
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('whatsapp:message-received', {
                    id: key.id,
                    from: phoneNumber + '@c.us', // Normalize format for frontend
                    to: '', // Not available in Baileys incoming messages
                    body: body,
                    type: this.getMessageType(message),
                    timestamp: timestamp,
                    hasMedia: hasMedia,
                    mediaUrl: mediaUrl,
                    mediaMimeType: mediaMimeType,
                    isUnsubscribeRequest: isUnsubscribe,
                    pushName: pushName
                });
            }
        } catch (error) {
            console.error('[MessageReceiverWorker] Error handling message:', error);
        }
    }

    /**
     * Extract message body from Baileys message
     */
    private extractMessageBody(message: proto.IMessage | null | undefined): string {
        if (!message) return '';

        // Text messages
        if (message.conversation) {
            return message.conversation;
        }

        if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        }

        // Media captions
        if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        }

        if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        }

        if (message.documentMessage?.caption) {
            return message.documentMessage.caption;
        }

        return '';
    }

    /**
     * Check if message has media content
     */
    private hasMediaContent(message: proto.IMessage | null | undefined): boolean {
        if (!message) return false;

        return !!(
            message.imageMessage ||
            message.videoMessage ||
            message.audioMessage ||
            message.documentMessage ||
            message.stickerMessage
        );
    }

    /**
     * Get message type
     */
    private getMessageType(message: proto.IMessage | null | undefined): string {
        if (!message) return 'chat';

        if (message.imageMessage) return 'image';
        if (message.videoMessage) return 'video';
        if (message.audioMessage) return 'audio';
        if (message.documentMessage) return 'document';
        if (message.stickerMessage) return 'sticker';
        if (message.conversation || message.extendedTextMessage) return 'chat';

        return 'chat';
    }

    /**
     * Process media message and save to disk
     */
    private async processMediaMessage(messageData: BaileysMessageData): Promise<{ url: string; mimeType: string } | null> {
        try {
            const { message, messageTimestamp, key } = messageData;
            if (!message) return null;

            // Determine mime type
            let mimeType = 'application/octet-stream';
            let extension = 'bin';

            if (message.imageMessage) {
                mimeType = message.imageMessage.mimetype || 'image/jpeg';
                extension = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
            } else if (message.videoMessage) {
                mimeType = message.videoMessage.mimetype || 'video/mp4';
                extension = 'mp4';
            } else if (message.audioMessage) {
                mimeType = message.audioMessage.mimetype || 'audio/ogg';
                extension = mimeType.includes('ogg') ? 'ogg' : 'mp3';
            } else if (message.documentMessage) {
                mimeType = message.documentMessage.mimetype || 'application/octet-stream';
                extension = message.documentMessage.fileName?.split('.').pop() || 'bin';
            } else if (message.stickerMessage) {
                mimeType = message.stickerMessage.mimetype || 'image/webp';
                extension = 'webp';
            }

            // Download media using Baileys helper
            // Note: downloadMediaMessage requires the full WAMessage, which we may not have fully
            // For now, we log a warning - full implementation would need socket reference
            console.warn('[MessageReceiverWorker] Media download not fully implemented yet');

            // Create media directory
            const mediaDir = path.join(app.getPath('userData'), 'media');
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir, { recursive: true });
            }

            // For now, return a placeholder - proper implementation requires socket access
            const timestamp = typeof messageTimestamp === 'number' ? messageTimestamp : Date.now() / 1000;
            const filename = `${timestamp}-${key.id}.${extension}`;

            return {
                url: `media://${filename}`,
                mimeType: mimeType
            };
        } catch (error) {
            console.error('[MessageReceiverWorker] Error processing media:', error);
            return null;
        }
    }

    /**
     * Check if the message is from a non-personal chat
     */
    private isNonPersonalChat(from: string): boolean {
        if (!from) return true;

        // Baileys uses @s.whatsapp.net for personal and @g.us for groups
        // Only allow personal chats
        if (from.endsWith('@g.us')) return true; // Group
        if (from.includes('@broadcast')) return true; // Broadcast
        if (from.includes('status@')) return true; // Status
        if (from.endsWith('@newsletter')) return true; // Channel

        return false;
    }

    /**
     * Extract and validate phone number from WhatsApp JID
     */
    private extractPhoneNumber(from: string): string | null {
        if (!from) return null;

        // Remove suffix (@s.whatsapp.net, @c.us, etc)
        const phoneNumber = from.split('@')[0].replace(/[^\d]/g, '');

        // Validate phone number length
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
