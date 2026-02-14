/**
 * AssetUtils.ts — Pure utility functions for assets.
 * 
 * Extracted from AssetService.ts (Phase 1 refactoring).
 * All functions are stateless — no class instance, no shared state.
 */

import { AssetFile } from './types';

// ─── Pure Display Functions ──────────────────────────────

/**
 * Format file size from bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format asset info for display (icon, label, description).
 */
export function getAssetDisplayInfo(asset: AssetFile): { icon: string; label: string; description: string } {
    const category = asset.category;
    const sizeStr = formatFileSize(asset.size || 0);

    switch (category) {
        case 'image':
            return { icon: '🖼️', label: 'Image', description: `${asset.name} (${sizeStr})` };
        case 'video':
            return { icon: '🎬', label: 'Video', description: `${asset.name} (${sizeStr})` };
        case 'document':
            return { icon: '📄', label: 'Document', description: `${asset.name} (${sizeStr})` };
        case 'audio':
            return { icon: '🎵', label: 'Audio', description: `${asset.name} (${sizeStr})` };
        default:
            return { icon: '📎', label: 'File', description: `${asset.name} (${sizeStr})` };
    }
}


/**
 * Get just the icon for an asset.
 */
export function getAssetIcon(asset: AssetFile): string {
    return getAssetDisplayInfo(asset).icon;
}

/**
 * Get asset categories for filtering UI.
 */
export function getAssetCategories(): { value: AssetFile['category']; label: string; icon: string }[] {
    return [
        { value: 'image', label: 'Images', icon: '🖼️' },
        { value: 'video', label: 'Videos', icon: '🎬' },
        { value: 'audio', label: 'Audio', icon: '🎵' },
        { value: 'document', label: 'Documents', icon: '📄' },
        { value: 'other', label: 'Other', icon: '📎' }
    ];
}

// ─── Pure Classification Functions ───────────────────────

/**
 * Determine asset category from file MIME type.
 */
export function getCategoryFromFileType(file: File): AssetFile['category'] {
    const type = file.type.toLowerCase();

    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (type.includes('pdf') || type.includes('document') || type.includes('text/')) return 'document';

    return 'other';
}

/**
 * Validate if asset can be sent via WhatsApp (size limits).
 */
export function canSendViaWhatsApp(asset: AssetFile): boolean {
    const whatsappLimits = {
        image: 16 * 1024 * 1024,    // 16MB
        video: 16 * 1024 * 1024,    // 16MB
        document: 100 * 1024 * 1024 // 100MB
    };

    const type = (asset.type || '').toLowerCase();
    const category = asset.category;
    const size = asset.size || 0;

    if (category === 'image' && type.includes('image')) {
        return size <= whatsappLimits.image;
    }
    if (category === 'video' && type.includes('video')) {
        return size <= whatsappLimits.video;
    }
    if (category === 'document' && type.includes('pdf')) {
        return size <= whatsappLimits.document;
    }

    return false;
}

// ─── Pure String Parsing ─────────────────────────────────

/**
 * Extract file name from Supabase storage URL.
 * URL format: https://[project].supabase.co/storage/v1/object/public/assets/[masterUserId]/[timestamp]_[filename]
 */
export function extractFileNameFromUrl(url: string): string | null {
    try {
        const parts = url.split('/');
        const fileNamePart = parts[parts.length - 1];
        return fileNamePart ? `${parts[parts.length - 2]}/${fileNamePart}` : null;
    } catch {
        return null;
    }
}
