import { db } from '../db';
import { handleDatabaseError } from '../supabase';
import { toISOString } from '../utils/timestamp';

export interface AssetCacheContext {
    db: typeof db;
    masterUserId: string;
}

/**
 * Get current storage usage in bytes
 */
export async function getCurrentStorageUsage(ctx: AssetCacheContext): Promise<number> {
    // We don't filter by masterUserId broadly because storage is a global device limit,
    // but if multi-tenant on same device, maybe we should? 
    // For now, let's just count all blobs to be safe on device storage.
    // Or if we want to limit per user?
    // The original implementation used db.asset_blobs.toArray() which gets ALL blobs.
    const assets = await ctx.db.asset_blobs.toArray();
    return assets.reduce((sum, asset) => sum + asset.size, 0);
}

/**
 * Evict oldest cached assets to free up space
 * @param requiredSize - The amount of space needed in bytes
 */
export async function evictOldestAssets(ctx: AssetCacheContext, requiredSize: number): Promise<void> {
    try {
        // Get currently cached assets
        // Global eviction (oldest accessed regardless of user) to free up space
        const cachedAssets = await ctx.db.asset_blobs.orderBy('last_accessed').toArray();

        let freedSize = 0;
        let index = 0;

        while (freedSize < requiredSize && index < cachedAssets.length) {
            const asset = cachedAssets[index];
            await ctx.db.asset_blobs.delete(asset.asset_id);
            freedSize += asset.size;
            index++;
        }

        console.log(`Evicted ${index} cached assets to free up ${freedSize} bytes`);
    } catch (error) {
        console.error('Error evicting oldest assets:', error);
        throw new Error(`Failed to evict assets: ${handleDatabaseError(error)}`);
    }
}

/**
 * Cache an asset file in IndexedDB
 * @param assetId - The ID of the asset
 * @param blob - The blob data to cache
 */
export async function cacheAssetFile(ctx: AssetCacheContext, assetId: string, blob: Blob): Promise<void> {
    console.log('AssetCacheService: cacheAssetFile() - Attempting to cache asset with ID:', assetId, 'size:', blob.size, 'bytes');
    try {
        // Get the asset to validate existence and get metadata
        console.log('AssetCacheService: Validating asset exists for user:', ctx.masterUserId);
        const asset = await ctx.db.assets
            .where('master_user_id')
            .equals(ctx.masterUserId)
            .and(item => item.id === assetId)
            .first();

        if (!asset) {
            console.error(`AssetCacheService: Asset with ID ${assetId} not found, cannot cache`);
            throw new Error(`Asset with ID ${assetId} not found`);
        }

        console.log('AssetCacheService: Asset validation passed, asset found:', asset.name);

        // Check if we're approaching storage limits (16MB for WhatsApp compatibility, per file)
        const maxAssetSize = 16 * 1024 * 1024; // 16MB
        if (blob.size > maxAssetSize) {
            console.error(`AssetCacheService: Asset exceeds maximum size of ${maxAssetSize} bytes`);
            throw new Error(`Asset exceeds maximum size of ${maxAssetSize} bytes`);
        }

        // Check total storage quota
        const currentUsage = await getCurrentStorageUsage(ctx);
        const maxCacheSize = 500 * 1024 * 1024; // 500MB as specified in the config
        console.log(`AssetCacheService: Current cache usage: ${currentUsage} bytes, requested: ${blob.size} bytes, max: ${maxCacheSize} bytes`);

        if (currentUsage + blob.size > maxCacheSize) {
            console.log('AssetCacheService: Cache size limit approaching, attempting to evict oldest assets...');
            // Evict oldest assets until there's enough space
            await evictOldestAssets(ctx, blob.size);
            console.log('AssetCacheService: Asset eviction completed');
        }

        // Store the blob in the asset_blobs table
        const cacheEntry = {
            asset_id: assetId,
            blob: blob,
            mime_type: blob.type,
            size: blob.size,
            cached_at: toISOString(new Date()),
            last_accessed: toISOString(new Date()),
            _version: 1
        };

        // Use put to update if exists or add if new
        await ctx.db.asset_blobs.put(cacheEntry);
        console.log(`AssetCacheService: Asset ${assetId} cached successfully, size: ${blob.size} bytes`);
    } catch (error) {
        console.error(`AssetCacheService: Error caching asset file ${assetId}:`, error);
        throw new Error(`Failed to cache asset: ${handleDatabaseError(error)}`);
    }
}

/**
 * Get a cached asset file from IndexedDB
 * @param assetId - The ID of the asset to retrieve
 * @returns The cached blob or null if not found
 */
export async function getCachedAssetFile(ctx: AssetCacheContext, assetId: string): Promise<Blob | null> {
    console.log('AssetCacheService: getCachedAssetFile() - Attempting to retrieve cached asset with ID:', assetId);
    try {
        const cacheEntry = await ctx.db.asset_blobs.get(assetId);
        if (!cacheEntry) {
            console.log(`AssetCacheService: Asset ${assetId} not found in cache`);
            return null;
        }

        // Update last accessed timestamp
        await ctx.db.asset_blobs.update(assetId, {
            last_accessed: toISOString(new Date())
        });

        console.log(`AssetCacheService: Asset ${assetId} retrieved from cache, size: ${cacheEntry.size} bytes, type: ${cacheEntry.mime_type}`);
        return cacheEntry.blob;
    } catch (error) {
        console.error(`AssetCacheService: Error retrieving cached asset file ${assetId}:`, error);
        return null;
    }
}

/**
 * Clear the entire asset cache
 */
export async function clearCache(ctx: AssetCacheContext): Promise<void> {
    try {
        console.log('AssetCacheService: Clearing asset cache...');
        await ctx.db.asset_blobs.clear();
        console.log('AssetCacheService: Asset cache cleared');
    } catch (error) {
        console.error('AssetCacheService: Error clearing cache:', error);
        throw new Error(`Failed to clear cache: ${handleDatabaseError(error)}`);
    }
}
