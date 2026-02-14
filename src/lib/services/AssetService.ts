import { AssetFile } from './types';
import { supabase, handleDatabaseError } from '../supabase';
import { db, LocalAsset } from '../db';
import { SyncManager } from '../sync/SyncManager';
import { userContextManager } from '../security/UserContextManager';
import {
  toISOString,
  localToSupabase,
  addSyncMetadata,
  standardizeForService
} from '../utils/timestamp';
import { activityService } from './ActivityService';
import {
  getAssetDisplayInfo as _getAssetDisplayInfo,
  getAssetCategories as _getAssetCategories,
  getCategoryFromFileType as _getCategoryFromFileType,
  canSendViaWhatsApp as _canSendViaWhatsApp,
  extractFileNameFromUrl as _extractFileNameFromUrl,
  formatFileSize as _formatFileSize,
  getAssetIcon as _getAssetIcon,
} from './AssetUtils';
import { cacheAssetFile, getCachedAssetFile, evictOldestAssets, getCurrentStorageUsage, clearCache } from './AssetCacheService';
import { syncAssetsFromSupabase, prefetchAssets, backgroundSyncPendingAssets, uploadFileToSupabase } from './AssetSyncService';

export class AssetService {
  private syncManager: SyncManager;
  private masterUserId: string | null = null;
  private initialSyncComplete: boolean = false;
  private initialSyncPromise: Promise<void> | null = null;

  constructor(syncManager?: SyncManager) {
    this.syncManager = syncManager || new SyncManager();
  }

  /**
   * Set the current master user ID and configure sync
   */
  async initialize(masterUserId: string) {
    this.masterUserId = masterUserId;
    this.syncManager.setMasterUserId(masterUserId);

    // Start auto sync
    this.syncManager.startAutoSync();
  }

  /**
   * Check if initial sync is complete
   */
  isInitialSyncComplete(): boolean {
    return this.initialSyncComplete;
  }

  /**
   * Wait for initial sync to complete (with timeout)
   */
  async waitForInitialSync(timeoutMs: number = 5000): Promise<boolean> {
    if (this.initialSyncComplete) {
      return true;
    }

    if (!this.initialSyncPromise) {
      return false;
    }

    try {
      await Promise.race([
        this.initialSyncPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), timeoutMs))
      ]);
      return true;
    } catch (error) {
      console.warn('Initial sync timeout or failed:', error);
      this.initialSyncComplete = true; // Mark as complete to unblock UI
      return false;
    }
  }


  /**
   * Get the current authenticated user
   */
  private async getCurrentUser() {
    const user = await userContextManager.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    return user;
  }

  /**
   * Get master user ID (for multi-tenant support)
   */
  private async getMasterUserId(): Promise<string> {
    if (this.masterUserId) {
      return this.masterUserId;
    }

    const user = await this.getCurrentUser();

    // Get user's profile to find master_user_id
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('master_user_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return user.id; // Fallback to current user ID
    }

    this.masterUserId = profile?.master_user_id || user.id;
    return this.masterUserId!;
  }

  /**
   * Transform local assets to match interface using standardized timestamps
   */
  private transformLocalAssets(localAssets: LocalAsset[]): AssetFile[] {
    return localAssets.map(asset => {
      // Use standardized timestamp transformation for assets
      const standardized = standardizeForService(asset, 'asset');

      // Handle both old and new property names for backwards compatibility
      const fileSize = asset.file_size || asset.size || 0;
      const fileType = asset.file_type || asset.type || '';
      const fileUrl = asset.file_url || asset.url || '';

      return {
        id: asset.id,
        name: asset.name,
        // Required properties with fallbacks
        file_name: asset.file_name || asset.name, // Use file_name if available, otherwise fallback to name
        file_size: fileSize,
        file_type: fileType,
        file_url: fileUrl,
        uploaded_by: asset.uploaded_by || '',
        master_user_id: asset.master_user_id || '', // Add the missing master_user_id property
        category: asset.category,
        is_public: asset.is_public !== false,
        created_at: standardized.created_at || asset.created_at,
        updated_at: standardized.updated_at || asset.updated_at,
        // Legacy properties for backwards compatibility
        size: fileSize,
        type: fileType,
        url: fileUrl,
        uploadDate: asset.created_at,
        mime_type: asset.mime_type
      };
    });
  }

  /**
   * Get all assets for the current user's master account
   * Prioritizes local data, falls back to server if needed
   * Enforces data isolation using UserContextManager
   */
  async getAssets(): Promise<AssetFile[]> {
    console.log('AssetService: getAssets() - Starting asset fetch operation');
    console.log('AssetService: Checking initial sync completion status');
    console.log('AssetService: Initial sync complete?', this.initialSyncComplete);

    try {
      // Enforce data isolation - check user context
      const hasPermission = await userContextManager.canPerformAction('read_assets', 'assets');
      if (!hasPermission) {
        console.error('AssetService: Access denied - insufficient permissions to read assets');
        throw new Error('Access denied: insufficient permissions to read assets');
      }

      const masterUserId = await this.getMasterUserId();
      console.log('AssetService: Fetching assets for master user ID:', masterUserId);

      // First, try to get from local database
      let localAssets = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted)
        .toArray();

      console.log('AssetService: Found', localAssets.length, 'local assets before sync');

      // If we have local data, return it
      if (localAssets.length > 0) {
        console.log('AssetService: Returning', localAssets.length, 'local assets from database');
        return this.transformLocalAssets(localAssets);
      }

      console.log('AssetService: No local assets found, triggering sync to fetch from server...');
      // No local data, try to sync from server
      // await this.syncManager.triggerSync(); -> Removed blocking sync. InitialSyncOrchestrator handles this.
      if (this.syncManager.getIsOnline()) {
        console.log('AssetService: Waiting for InitialSyncOrchestrator to complete instead of triggering blocking sync');
      }
      console.log('AssetService: Sync completed, fetching assets from local DB again...');

      // Try local again after sync
      localAssets = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted)
        .toArray();

      console.log('AssetService: Found', localAssets.length, 'local assets after sync');

      if (localAssets.length > 0) {
        console.log('AssetService: Returning', localAssets.length, 'local assets from database after sync');
        return this.transformLocalAssets(localAssets);
      }

      // Still no data, return empty array (assets are uploaded, not fetched from server initially)
      console.log('AssetService: No assets found from server, returning empty array');
      return [];
    } catch (error) {
      console.error('AssetService: Error fetching assets:', error);
      // Fallback to empty array if local operations fail
      return [];
    }
  }

  /**
   * Get a single asset by ID
   */
  async getAssetById(id: string): Promise<AssetFile | null> {
    console.log('AssetService: getAssetById() - Fetching asset with ID:', id);
    try {
      const masterUserId = await this.getMasterUserId();
      console.log('AssetService: Fetching asset for master user ID:', masterUserId);

      // Try local first with proper master_user_id isolation
      const localAsset = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted && asset.id === id)
        .first();

      if (localAsset) {
        console.log('AssetService: Found asset in local database:', localAsset.name, 'with URL:', localAsset.file_url);
        const transformed = this.transformLocalAssets([localAsset]);
        return transformed[0] || null;
      }

      console.log('AssetService: Asset not found in local database');
      // For assets, we don't have a server table to fallback to
      // All assets are stored locally with their URLs
      return null;
    } catch (error) {
      console.error('AssetService: Error fetching asset by ID:', error);
      return null;
    }
  }

  /**
   * Get assets by IDs
   */
  async getAssetsByIds(ids: string[]): Promise<AssetFile[]> {
    try {
      const masterUserId = await this.getMasterUserId();

      // Try local first
      const localAssets = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted && ids.includes(asset.id))
        .toArray();

      if (localAssets.length > 0) {
        return this.transformLocalAssets(localAssets);
      }

      return [];
    } catch (error) {
      console.error('Error fetching assets by IDs:', error);
      return [];
    }
  }

  /**
   * Get assets by category
   */
  async getAssetsByCategory(category: AssetFile['category']): Promise<AssetFile[]> {
    try {
      const masterUserId = await this.getMasterUserId();

      // Try local first
      let localAssets = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted && asset.category === category)
        .toArray();

      if (localAssets.length > 0) {
        return this.transformLocalAssets(localAssets);
      }

      return [];
    } catch (error) {
      console.error('Error fetching assets by category:', error);
      return [];
    }
  }

  /**
   * Upload a file and create asset record to server - online only (private method)
   */


  /**
   * Background sync assets without blocking the main operation
   */
  async backgroundSyncAssets(): Promise<void> {
    try {
      // Don't await this to avoid blocking the main operation
      // this.syncManager.triggerSync().catch(...) -> Removed to prevent blocking initialization
      // Initial sync is now handled by InitialSyncOrchestrator
    } catch (error) {
      console.warn('Failed to trigger background sync:', error);
    }
  }

  /**
   * Background sync specifically for pending asset uploads
   */
  async backgroundSyncPendingAssets(): Promise<void> {
    const masterUserId = await this.getMasterUserId();
    const user = await this.getCurrentUser();

    return backgroundSyncPendingAssets({
      db,
      masterUserId,
      user,
      syncManager: this.syncManager
    });
  }

  /**
   * Queue asset upload for offline-first processing
   */
  async queueUpload(file: File, metadata: { category: AssetFile['category'] }): Promise<AssetFile> {
    console.log('AssetService: queueUpload() - Starting asset upload process for file:', file.name);
    console.log('AssetService: File details - type:', file.type, 'size:', file.size, 'category:', metadata.category);

    try {
      const user = await this.getCurrentUser();
      const masterUserId = await this.getMasterUserId();
      console.log('AssetService: Current user:', user.id, 'Master user:', masterUserId);

      // Check online status
      const isOnline = this.syncManager.getIsOnline();
      console.log('AssetService: Online status:', isOnline);

      // First, generate asset ID for reference
      const assetId = crypto.randomUUID();
      console.log('AssetService: Generated asset ID:', assetId);

      // Prepare local asset data with standardized timestamps
      const nowISOTime = toISOString(new Date());

      const newLocalAsset: Omit<LocalAsset, 'id'> = {
        name: file.name,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_url: '', // Will be filled after online upload
        uploaded_by: user.id,
        category: metadata.category,
        master_user_id: masterUserId,
        is_public: true,
        mime_type: file.type,
        created_at: nowISOTime,
        updated_at: nowISOTime,
        _syncStatus: 'pending',
        _lastModified: nowISOTime,
        _version: 1,
        _deleted: false
      };

      const localAsset = {
        id: assetId,
        ...newLocalAsset
      };

      console.log('AssetService: Adding asset to local database...');
      // Add to local database with pending status FIRST
      await db.assets.add(localAsset);
      console.log('AssetService: Asset added to local database');

      console.log('AssetService: Caching asset file in blob storage...');
      // THEN store the file blob in asset_blobs table for caching
      // (cacheAssetFile validates asset exists in DB)
      await this.cacheAssetFile(assetId, file);
      console.log('AssetService: Asset file cached successfully');

      if (isOnline) {
        console.log('AssetService: Device is online, attempting direct upload to Supabase Storage...');
        // If online, upload file to storage and update the asset
        try {
          // Use shared helper for upload
          const publicUrl = await uploadFileToSupabase(masterUserId, file);
          console.log('AssetService: File uploaded successfully via shared helper. URL:', publicUrl);

          // Update the local asset with the file URL
          const updatedAsset = {
            ...localAsset,
            file_url: publicUrl,
            _syncStatus: 'pending' as const,
            _lastModified: toISOString(new Date())
          };

          await db.assets.update(assetId, {
            file_url: publicUrl,
            _syncStatus: 'pending',
            _lastModified: toISOString(new Date())
          });
          console.log('AssetService: Local asset updated with URL');

          // Add to sync queue with complete data including master_user_id
          const syncData = localToSupabase(updatedAsset);
          console.log('AssetService: Queueing asset for sync:', {
            id: assetId,
            master_user_id: syncData.master_user_id,
            has_master_user_id: !!syncData.master_user_id
          });
          await this.syncManager.addToSyncQueue('assets', 'create', assetId, syncData);
          console.log('AssetService: Asset queued for sync');

          // Return the updated asset
          const result = this.transformLocalAssets([updatedAsset])[0];
          console.log('AssetService: Upload complete, returning asset:', result.name);

          // Notify activity service for real-time dashboard updates
          setTimeout(() => activityService.notifyListeners(), 0);

          return result;
        } catch (uploadError) {
          console.error('AssetService: Failed to upload to storage, will retry later:', uploadError);
          // Keep asset as pending for background sync
          await this.syncManager.addToSyncQueue('assets', 'create', assetId, localToSupabase(localAsset));

          // Still notify since asset is added locally
          setTimeout(() => activityService.notifyListeners(), 0);

          return this.transformLocalAssets([localAsset])[0];
        }
      } else {
        console.log('AssetService: Device is offline, queueing for background sync');
        // If offline, queue for background sync
        await this.syncManager.addToSyncQueue('assets', 'create', assetId, localToSupabase(localAsset));
        console.log('AssetService: Asset queued for background sync');

        // Notify activity service for real-time dashboard updates
        setTimeout(() => activityService.notifyListeners(), 0);

        // Return the local asset
        const result = this.transformLocalAssets([localAsset])[0];
        console.log('AssetService: Upload queued, returning asset:', result.name);
        return result;
      }
    } catch (error) {
      console.error('AssetService: Error queueing asset upload:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Delete an asset - soft delete locally with sync
   */
  async deleteAsset(id: string): Promise<boolean> {
    try {
      const masterUserId = await this.getMasterUserId();

      // Check if asset exists locally with proper user isolation
      const existingAsset = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(asset => !asset._deleted && asset.id === id)
        .first();

      if (!existingAsset) {
        // Try server-side deletion if not found locally
        await this.deleteAssetFromServer(id);
        console.log(`AssetService: Asset ${id} not found locally, attempted server-side deletion`);
        return true;
      }

      // Log asset deletion to console with metadata
      console.log(`AssetService: Asset deleted locally with metadata - ID: ${id}, Name: ${existingAsset.name}, Type: ${existingAsset.file_type}, Size: ${existingAsset.file_size} bytes, Category: ${existingAsset.category}. Waiting to sync delete on cloud.`);

      // Use standardized sync metadata for soft delete
      const syncMetadata = addSyncMetadata(existingAsset, true);

      // Soft delete locally
      await db.assets.update(id, {
        _syncStatus: syncMetadata._syncStatus,
        _lastModified: syncMetadata._lastModified,
        _version: syncMetadata._version,
        _deleted: true
      });

      // Transform for sync queue (convert Date objects to ISO strings)
      const syncData = localToSupabase(existingAsset);
      await this.syncManager.addToSyncQueue('assets', 'delete', id, syncData);

      // Also delete from Supabase Storage
      if (existingAsset.url) {
        try {
          const fileName = this.extractFileNameFromUrl(existingAsset.url);
          if (fileName) {
            await supabase.storage
              .from('assets')
              .remove([fileName]);
          }
        } catch (storageError) {
          console.warn('Failed to delete file from storage:', storageError);
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting asset:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Delete asset from server storage (fallback)
   */
  private async deleteAssetFromServer(id: string): Promise<void> {
    // For assets, we don't have a database table to delete from
    // We just need to delete from storage if we have the URL
    // This is mainly for cleanup in case local data is corrupted
    const masterUserId = await this.getMasterUserId();
    const asset = await db.assets
      .where('master_user_id')
      .equals(masterUserId)
      .and(item => item.id === id)
      .first();
    if (asset?.url) {
      try {
        const fileName = this.extractFileNameFromUrl(asset.url);
        if (fileName) {
          await supabase.storage
            .from('assets')
            .remove([fileName]);
        }
      } catch (storageError) {
        console.warn('Failed to delete file from storage:', storageError);
      }
    }
  }

  /**
   * Extract file name from Supabase storage URL
   * @delegate AssetUtils.extractFileNameFromUrl
   */
  private extractFileNameFromUrl(url: string): string | null {
    return _extractFileNameFromUrl(url);
  }

  /**
   * Get assets suitable for WhatsApp messaging
   */
  async getWhatsAppCompatibleAssets(): Promise<AssetFile[]> {
    try {
      const assets = await this.getAssets();
      return assets.filter(asset => {
        const type = (asset.type || '').toLowerCase();
        const category = asset.category;
        // WhatsApp supports: images (jpg, png), documents (pdf), videos (mp4)
        return (category === 'image' && (type.includes('image'))) ||
          (category === 'document' && type.includes('pdf')) ||
          (category === 'video' && type.includes('video'));
      });
    } catch (error) {
      console.error('Error fetching WhatsApp compatible assets:', error);
      return [];
    }
  }

  /**
   * Validate if asset can be sent via WhatsApp
   */
  canSendViaWhatsApp(asset: AssetFile): boolean {
    return _canSendViaWhatsApp(asset);
  }

  /**
   * Get asset statistics
   */
  async getAssetStats() {
    try {
      const assets = await this.getAssets();

      const totalSize = assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
      const categoryStats = assets.reduce((stats, asset) => {
        stats[asset.category] = (stats[asset.category] || 0) + 1;
        return stats;
      }, {} as Record<string, number>);

      const largestAsset = assets.reduce((largest, asset) =>
        (asset.size || 0) > (largest.size || 0) ? asset : largest,
        assets[0]
      );

      return {
        total: assets.length,
        totalSize,
        categoryStats,
        largestAsset: largestAsset || null,
        averageSize: assets.length > 0 ? Math.round(totalSize / assets.length) : 0
      };
    } catch (error) {
      console.error('Error fetching asset stats:', error);
      return {
        total: 0,
        totalSize: 0,
        categoryStats: {},
        largestAsset: null,
        averageSize: 0
      };
    }
  }

  /**
   * Format asset info for display
   */
  getAssetDisplayInfo(asset: AssetFile): { icon: string; label: string; description: string } {
    return _getAssetDisplayInfo(asset);
  }



  /**
   * Get asset categories for filtering
   */
  getAssetCategories(): { value: AssetFile['category']; label: string; icon: string }[] {
    return _getAssetCategories();
  }

  /**
   * Determine asset category from file type
   */
  getCategoryFromFileType(file: File): AssetFile['category'] {
    return _getCategoryFromFileType(file);
  }

  /**
   * Force sync with server
   */
  async forceSync(): Promise<void> {
    await this.syncManager.triggerSync();
  }

  /**
   * Get sync status for assets
   */
  async getSyncStatus() {
    const localAssets = await db.assets
      .where('master_user_id')
      .equals(await this.getMasterUserId())
      .and(asset => !asset._deleted)
      .toArray();

    const pending = localAssets.filter(a => a._syncStatus === 'pending').length;
    const synced = localAssets.filter(a => a._syncStatus === 'synced').length;
    const conflicts = localAssets.filter(a => a._syncStatus === 'conflict').length;

    return {
      total: localAssets.length,
      pending,
      synced,
      conflicts,
      syncManagerStatus: this.syncManager.getStatus()
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.syncManager.destroy();
  }

  /**
   * Cache an asset file in IndexedDB
   * @param assetId - The ID of the asset
   * @param blob - The blob data to cache
   */
  async cacheAssetFile(assetId: string, blob: Blob): Promise<void> {
    return cacheAssetFile({
      db,
      masterUserId: await this.getMasterUserId()
    }, assetId, blob);
  }


  /**
   * Get a cached asset file from IndexedDB
   * @param assetId - The ID of the asset to retrieve
   * @returns The cached blob or null if not found
   */
  async getCachedAssetFile(assetId: string): Promise<Blob | null> {
    return getCachedAssetFile({
      db,
      masterUserId: await this.getMasterUserId()
    }, assetId);
  }

  /**
   * Get an asset with cache fallback
   * @param assetId - The ID of the asset to retrieve
   * @returns The asset blob (from cache or fetched from server)
   */
  async getAssetWithCache(assetId: string): Promise<Blob> {
    console.log('AssetService: getAssetWithCache() - Attempting to retrieve asset with ID:', assetId);

    try {
      // First, try to get from cache
      let cachedBlob = await this.getCachedAssetFile(assetId);
      if (cachedBlob) {
        console.log('AssetService: Asset found in cache, returning cached version');
        return cachedBlob;
      }

      console.log('AssetService: Asset not found in cache, looking for local asset record...');
      // Cache miss - fetch from server
      const masterUserId = await this.getMasterUserId();
      const asset = await db.assets
        .where('master_user_id')
        .equals(masterUserId)
        .and(item => item.id === assetId)
        .first();
      if (!asset) {
        console.error(`AssetService: Asset with ID ${assetId} not found in local database`);
        throw new Error(`Asset with ID ${assetId} not found`);
      }

      console.log('AssetService: Found asset record, attempting to download from URL:', asset.file_url);

      // Download from the asset URL
      console.log('AssetService: Fetching asset from server URL:', asset.file_url);
      const response = await fetch(asset.file_url);
      if (!response.ok) {
        console.error(`AssetService: Failed to fetch asset from ${asset.file_url}: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch asset from ${asset.file_url}: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      console.log('AssetService: Asset downloaded successfully, size:', blob.size, 'bytes, type:', blob.type);

      // Cache the downloaded asset for future use
      try {
        await this.cacheAssetFile(assetId, blob);
        console.log('AssetService: Asset cached successfully for future use');
      } catch (cacheError) {
        // Non-critical error - continue with the blob even if caching fails
        console.warn(`AssetService: Failed to cache asset ${assetId}:`, cacheError);
      }

      console.log('AssetService: Successfully retrieved and cached asset');
      return blob;
    } catch (error) {
      console.error(`AssetService: Error getting asset with cache ${assetId}:`, error);
      throw new Error(`Failed to get asset: ${handleDatabaseError(error)}`);
    }
  }

  /**
   * Clear asset cache
   * @param olderThan - Optional date to clear only assets cached before this date
   */
  async clearCache(): Promise<void> {
    return clearCache({
      db,
      masterUserId: await this.getMasterUserId()
    });
  }

  /**
   * Get current storage usage for asset cache
   */
  async getCurrentStorageUsage(): Promise<number> {
    return getCurrentStorageUsage({
      db,
      masterUserId: await this.getMasterUserId()
    });
  }

  /**
   * Evict oldest cached assets to free up space
   * @param requiredSize - The amount of space needed in bytes
   */
  async evictOldestAssets(requiredSize: number): Promise<void> {
    return evictOldestAssets({
      db,
      masterUserId: await this.getMasterUserId()
    }, requiredSize);
  }

  /**
   * Sync and cache all assets for the current user
   * Matches local metadata with cached blobs and downloads missing content
   * Returns stats for UI feedback
   */
  async syncAssetsFromSupabase(onProgress?: (progress: number) => void): Promise<{ syncedCount: number; skippedCount: number; errorCount: number }> {
    const user = await this.getCurrentUser();
    const masterUserId = await this.getMasterUserId();

    return syncAssetsFromSupabase({
      db,
      user,
      masterUserId,
      syncManager: this.syncManager
    }, onProgress);
  }

  /**
   * Pre-fetch assets in background with concurrency limit
   * @param assetIds - Array of asset IDs to prefetch
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns Stats about the prefetch operation
   */
  async prefetchAssets(assetIds: string[], onProgress?: (progress: number) => void): Promise<{ success: number; skipped: number; failed: number }> {
    const user = await this.getCurrentUser();
    const masterUserId = await this.getMasterUserId();

    return prefetchAssets({
      db,
      user,
      masterUserId,
      syncManager: this.syncManager
    }, assetIds, onProgress);
  }
}

// Export both the class and create a singleton instance
// export const assetService = new AssetService();
export { AssetService as AssetServiceClass };
export type { AssetFile };