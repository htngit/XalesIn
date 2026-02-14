import { AssetFile } from './types';
import { supabase, handleDatabaseError } from '../supabase';
import { db, LocalAsset } from '../db';
import { SyncManager } from '../sync/SyncManager';
import { addTimestamps, addSyncMetadata, toISOString, localToSupabase } from '../utils/timestamp';
import { cacheAssetFile, getCachedAssetFile } from './AssetCacheService';

export interface AssetSyncContext {
    db: typeof db;
    masterUserId: string;
    user: { id: string }; // Needed for upload
    syncManager: SyncManager;
    // We need to pass cache context or just use imports if we can construct context inside?
    // AssetCacheService functions take AssetCacheContext { db, masterUserId }.
    // We can construct it on the fly or pass it.
}

/**
 * Helper to upload file to Supabase Storage and get URL
 */
export async function uploadFileToSupabase(
    masterUserId: string,
    file: File
): Promise<string> {
    const fileName = `${masterUserId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, file);

    if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

    return urlData.publicUrl;
}

/**
 * Sync and cache all assets for the current user
 * Matches local metadata with cached blobs and downloads missing content
 * Returns stats for UI feedback
 */
export async function syncAssetsFromSupabase(
    ctx: AssetSyncContext,
    onProgress?: (progress: number) => void
): Promise<{ syncedCount: number; skippedCount: number; errorCount: number }> {
    console.log('AssetSyncService: syncAssetsFromSupabase() - Starting full asset content sync');
    try {
        // Get all asset IDs from local DB (metadata is already synced)
        const allAssets = await ctx.db.assets
            .where('master_user_id')
            .equals(ctx.masterUserId)
            .and(asset => !asset._deleted)
            .toArray();

        if (allAssets.length === 0) {
            console.log('AssetSyncService: No assets found in local DB. Checking Supabase directly...');

            // Fallback: Check Supabase directly in case sync failed or hasn't run yet
            const { data: serverAssets, error } = await supabase
                .from('assets')
                .select('*')
                .eq('master_user_id', ctx.masterUserId);

            if (error) {
                console.error('AssetSyncService: Error checking Supabase for assets:', error);
                if (onProgress) onProgress(100);
                return { syncedCount: 0, skippedCount: 0, errorCount: 0 };
            }

            if (!serverAssets || serverAssets.length === 0) {
                console.log('AssetSyncService: No assets found on Supabase either.');
                if (onProgress) onProgress(100);
                return { syncedCount: 0, skippedCount: 0, errorCount: 0 };
            }

            console.log(`AssetSyncService: Found ${serverAssets.length} assets on Supabase that were missing locally. Syncing metadata...`);

            // Insert missing metadata into local DB
            await ctx.db.assets.bulkPut(serverAssets.map(asset => ({
                ...asset,
                _syncStatus: 'synced',
                _lastModified: new Date().toISOString(),
                _version: 1,
                _deleted: false
            })));

            // Update allAssets array to proceed with download
            allAssets.push(...serverAssets as any[]);
        }

        const assetIds = allAssets.map(a => a.id);
        console.log(`AssetSyncService: Found ${assetIds.length} assets to check/download`);

        // Use prefetchAssets with progress tracking
        const stats = await prefetchAssets(ctx, assetIds, onProgress);

        console.log('AssetSyncService: Full asset content sync completed', stats);

        return {
            syncedCount: stats.success,
            skippedCount: stats.skipped,
            errorCount: stats.failed
        };
    } catch (error) {
        console.error('AssetSyncService: Error during full asset content sync:', error);
        // Return empty stats on error to avoid breaking UI
        return { syncedCount: 0, skippedCount: 0, errorCount: 0 };
    }
}

/**
 * Pre-fetch assets in background with concurrency limit
 * @param assetIds - Array of asset IDs to prefetch
 * @param onProgress - Optional callback for progress updates (0-100)
 * @returns Stats about the prefetch operation
 */
export async function prefetchAssets(
    ctx: AssetSyncContext,
    assetIds: string[],
    onProgress?: (progress: number) => void
): Promise<{ success: number; skipped: number; failed: number }> {
    console.log('AssetSyncService: prefetchAssets() - Starting prefetch for', assetIds.length, 'assets');

    const CONCURRENCY = 3;
    const total = assetIds.length;
    let completed = 0;

    // Stats tracking
    let success = 0;
    let skipped = 0;
    let failed = 0;

    const processAsset = async (assetId: string) => {
        try {
            // Check if already cached
            // Construct minimal cache context
            const cacheCtx = { db: ctx.db, masterUserId: ctx.masterUserId };
            const isCached = await getCachedAssetFile(cacheCtx, assetId);
            if (isCached) {
                console.log(`AssetSyncService: Asset ${assetId} already cached, skipping download`);
                skipped++;
                return;
            }

            // Fetch and cache
            const asset = await ctx.db.assets
                .where('master_user_id')
                .equals(ctx.masterUserId)
                .and(item => item.id === assetId)
                .first();

            if (!asset) {
                console.warn(`AssetSyncService: Asset with ID ${assetId} not found for prefetch`);
                failed++; // Count as failed if metadata missing
                return;
            }

            if (!asset.file_url) {
                console.log(`AssetSyncService: Asset ${assetId} has no URL, skipping`);
                skipped++;
                return;
            }

            console.log(`AssetSyncService: Downloading asset ${assetId} from URL:`, asset.file_url);
            const response = await fetch(asset.file_url);
            if (!response.ok) {
                throw new Error(`Failed to prefetch asset from ${asset.file_url}: ${response.status}`);
            }

            const blob = await response.blob();
            console.log(`AssetSyncService: Downloaded asset ${assetId}, size:`, blob.size, 'bytes');
            await cacheAssetFile(cacheCtx, assetId, blob);
            console.log(`AssetSyncService: Asset ${assetId} successfully cached`);
            success++;

        } catch (error) {
            console.error(`AssetSyncService: Error pre-fetching asset ${assetId}:`, error);
            failed++;
        } finally {
            completed++;
            if (onProgress) {
                onProgress(Math.round((completed / total) * 100));
            }
        }
    };

    // Execute with concurrency limit
    const executing = new Set<Promise<void>>();
    const results: Promise<void>[] = [];

    for (const id of assetIds) {
        const p = processAsset(id).then(() => {
            executing.delete(p);
        });
        results.push(p);
        executing.add(p);

        if (executing.size >= CONCURRENCY) {
            await Promise.race(executing);
        }
    }

    await Promise.all(results);

    console.log(`AssetSyncService: Prefetch completed. Processed ${completed}/${total} assets. Success: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
    return { success, skipped, failed };
}

/**
 * Upload a file and create asset record to server - online only
 * Returns the created asset
 */
export async function uploadAssetOnline(
    ctx: AssetSyncContext,
    file: File,
    category: AssetFile['category']
): Promise<AssetFile> {
    try {
        // Upload to Supabase and get URL
        const publicUrl = await uploadFileToSupabase(ctx.masterUserId, file);

        // Use standardized timestamp utilities
        const timestamps = addTimestamps({}, false);
        const syncMetadata = addSyncMetadata({}, false);

        // Prepare local asset data
        const newLocalAsset: Omit<LocalAsset, 'id'> = {
            name: file.name,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            file_url: publicUrl,
            uploaded_by: ctx.user.id,
            category,
            master_user_id: ctx.masterUserId,
            is_public: true,
            mime_type: file.type,
            created_at: timestamps.created_at,
            updated_at: timestamps.updated_at,
            _syncStatus: syncMetadata._syncStatus,
            _lastModified: syncMetadata._lastModified,
            _version: syncMetadata._version,
            _deleted: false
        };

        // Add to local database first
        const assetId = crypto.randomUUID();
        const localAsset = {
            id: assetId,
            ...newLocalAsset
        };

        await ctx.db.assets.add(localAsset);

        // Transform for sync queue (convert Date objects to ISO strings)
        const syncData = localToSupabase(localAsset);
        await ctx.syncManager.addToSyncQueue('assets', 'create', assetId, syncData);

        // Return the local asset disguised as AssetFile
        // Return the local asset disguised as AssetFile
        return localAsset as unknown as AssetFile;

    } catch (error) {
        console.error('AssetSyncService: Error uploading asset:', error);
        throw new Error(handleDatabaseError(error));
    }
}

/**
 * Background sync specifically for pending asset uploads
 */
export async function backgroundSyncPendingAssets(ctx: AssetSyncContext): Promise<void> {
    try {
        // Get all pending assets for the current user
        const pendingAssets = await ctx.db.assets
            .where('master_user_id')
            .equals(ctx.masterUserId)
            .and(asset => asset._syncStatus === 'pending')
            .toArray();

        if (pendingAssets.length === 0) {
            return; // Nothing to sync
        }

        // Check if we're online before attempting sync
        const isOnline = ctx.syncManager.getIsOnline();
        if (!isOnline) {
            console.log('AssetSyncService: Offline, skipping pending asset sync');
            return;
        }

        // Process each pending asset
        for (const asset of pendingAssets) {
            try {
                // Find the cached blob for this asset if available
                const cacheCtx = { db: ctx.db, masterUserId: ctx.masterUserId };
                const cachedBlob = await getCachedAssetFile(cacheCtx, asset.id);

                if (cachedBlob) {
                    // Upload to Supabase and get URL
                    // We construct a File object from the blob
                    const file = new File([cachedBlob], asset.name, { type: asset.mime_type || asset.file_type });
                    const publicUrl = await uploadFileToSupabase(ctx.masterUserId, file);

                    // Update local asset with URL and synced status
                    await ctx.db.assets.update(asset.id, {
                        file_url: publicUrl,
                        _syncStatus: 'synced',
                        _lastModified: toISOString(new Date())
                    });

                    // Update sync queue: we need to push an UPDATE op with the new URL
                    // Or if it was a CREATE that failed to sync, we might need to update the existing CREATE op?
                    // Typically 'pending' means we haven't synced it yet.
                    // If we have a pending CREATE op in sync queue, we should update it with the URL?
                    // Or just let the next sync cycle pick it up?
                    // The sync/PushOperations usually picks up from `sync_queue` table.
                    // If we added to `sync_queue` in `queueUpload` (in AssetService), it might have empty URL.
                    // We need to update the queued item too?
                    // Ideally, we add a NEW sync queue item for 'update' with the URL?
                    // Or we just update the asset and let standard sync logic handle it?
                    // Standard sync logic (push) reads from sync_queue.
                    // If we didn't queue it yet (because we were offline and queueing might be handled differently?), 
                    // In `queueUpload`: `await this.syncManager.addToSyncQueue('assets', 'create', assetId, syncData);`
                    // So the CREATE op is already in queue with empty URL.
                    // We should probably update that queue item if possible, or just append an UPDATE op.
                    // Appending UPDATE is safer.
                    await ctx.syncManager.addToSyncQueue('assets', 'update', asset.id, {
                        file_url: publicUrl,
                        _lastModified: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error(`AssetSyncService: Failed to sync pending asset ${asset.id}:`, error);
                // Keep the asset as pending for retry
                await ctx.db.assets.update(asset.id, {
                    _syncStatus: 'pending',
                    _lastModified: toISOString(new Date())
                });
            }
        }
    } catch (error) {
        console.error('AssetSyncService: Error during background sync of pending assets:', error);
    }
}
