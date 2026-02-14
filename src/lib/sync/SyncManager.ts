import { db, type SyncOperation } from '../db'; // Dexie instance
import { userContextManager } from '../security/UserContextManager';

import {
  nowISO
} from '../utils/timestamp';
import { validateData, logValidationError } from '../utils/validation';
import {
  getPrioritizedSyncOperations as _getPrioritizedSyncOperations,
} from './SyncQueue';
import {
  updateSyncMetrics as _updateSyncMetrics,
  getSyncStats as _getSyncStats,
  compressData as _compressData,
  performCleanup as _performCleanup,
} from './SyncMetricsAndCleanup';
import {
  processBatchWithRetry as _processBatchWithRetry,
  processOperationWithRetry as _processOperationWithRetry,
  processOperation as _processOperation,
  pushCreate as _pushCreate,
  pushUpdate as _pushUpdate,
  pushDelete as _pushDelete,
} from './SyncPushOperations';
import {
  setupOnlineDetection as _setupOnlineDetection,
  setupActivityDetection as _setupActivityDetection,
  setupCleanupScheduler as _setupCleanupScheduler,
  checkConnectionQuality as _checkConnectionQuality,
  adjustSyncInterval as _adjustSyncInterval,
  restartAutoSync as _restartAutoSync,
} from './ConnectionMonitor';
import {
  pullFromServerWithCache as _pullFromServerWithCache,
  pullTableFromServer as _pullTableFromServer,
  PullContext
} from './SyncPullOperations';
import {
  partialSync as _partialSync,
  backgroundSync as _backgroundSync,
  PartialSyncContext
} from './PartialSyncStrategy';

// ─── Re-export all types from SyncTypes for backward compatibility ───
export {
  SyncStatus,
  ConflictResolution,
  SyncPriority,
  type SyncEvent,
  type SyncEventListener,
  type SyncConfig,
  type ActivityConfig,
  type PrioritySyncOperation,
  type SyncMetrics,
  type ConnectionState,
} from './SyncTypes';

import type {
  SyncEvent,
  SyncEventListener,
  SyncConfig,
  ActivityConfig,
  SyncMetrics,
  ConnectionState,
  PrioritySyncOperation,
} from './SyncTypes';

import {
  SyncStatus,
  ConflictResolution,
  SyncPriority,
} from './SyncTypes';


export class SyncManager {
  private eventListeners: SyncEventListener[] = [];
  private status: SyncStatus = SyncStatus.IDLE;
  private syncInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isOnline: boolean = navigator.onLine;
  private currentConfig: SyncConfig;
  private masterUserId: string | null = null;

  // Track ongoing syncs to prevent race conditions
  private _isInitialSyncInProgress: boolean = false;
  private _syncPromise: Promise<void> | null = null;
  private _tableSyncInProgress: Map<string, boolean> = new Map();

  // Enhanced properties for new features
  private activityConfig: ActivityConfig;
  private connectionState: ConnectionState;
  private syncMetrics: SyncMetrics;
  private lastUserActivity: Date = new Date();
  private currentSyncInterval: number;
  private retryDelays: Map<string, number> = new Map(); // operationId -> delay
  private syncCache: Map<string, any> = new Map(); // Cache for frequently accessed data
  private compressionCache: Map<string, string> = new Map(); // Compressed data cache
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private activityCheckInterval: NodeJS.Timeout | null = null;
  private _cleanupOnlineDetection: (() => void) | null = null;
  private _cleanupActivityDetection: (() => void) | null = null;

  constructor(config?: Partial<SyncConfig>) {
    this.currentConfig = {
      autoSync: false, // User Request: Disable frequent polling. Fetch is only for empty DB.
      baseSyncInterval: 900000, // 15 minutes (default interval)
      maxRetries: 3,
      conflictResolution: ConflictResolution.LAST_WRITE_WINS,
      batchSize: 50,
      maxQueueSize: 1000,
      cleanupInterval: 300000, // 5 minutes
      connectionTimeout: 10000, // 10 seconds
      retryBackoffMultiplier: 2,
      maxBackoffDelay: 300000, // 5 minutes
      activityDetectionEnabled: false, // Disable activity checks to prevent triggering syncs
      backgroundSyncEnabled: false, // Disable background sync
      compressionEnabled: false,
      ...config
    };

    // Initialize activity configuration
    this.activityConfig = {
      userActionThreshold: 5000, // 5 seconds
      syncIntervalMultiplier: 0.5, // More frequent sync when active
      idleTimeout: 300000, // 5 minutes
      backgroundInterval: 300000 // 5 minutes for background
    };

    // Initialize connection state
    this.connectionState = {
      isOnline: navigator.onLine,
      quality: 'good',
      lastCheck: new Date(),
      consecutiveFailures: 0,
      averageLatency: 0
    };

    // Initialize sync metrics
    this.syncMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageSyncTime: 0,
      lastSyncTime: new Date(0),
      dataTransferred: 0,
      compressionRatio: 1.0,
      connectionQuality: 'good'
    };

    // Initialize current sync interval
    this.currentSyncInterval = this.currentConfig.baseSyncInterval;

    this.setupOnlineDetection();
    this.setupActivityDetection();
    this.setupCleanupScheduler();
  }

  /**
   * Set the current master user ID for sync operations
   */
  setMasterUserId(masterUserId: string | null) {
    if (this.masterUserId !== masterUserId) {
      // Clear all user-specific state when switching users
      this.syncCache.clear();
      this.compressionCache.clear();
      this.retryDelays.clear();
      this._tableSyncInProgress.clear();
      this.retryDelays.clear();
    }
    this.masterUserId = masterUserId;
  }

  /**
   * Get current online status
   * Centralized method for all services to check connectivity
   */
  public getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get the timestamp of the last successful sync (in-memory metrics)
   */
  public getGlobalLastSyncTime(): Date {
    return this.syncMetrics.lastSyncTime;
  }

  /**
   * Add event listener for sync events
   */
  addEventListener(listener: SyncEventListener) {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: SyncEventListener) {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit sync event to all listeners
   */
  private emit(event: Omit<SyncEvent, 'timestamp'>) {
    const fullEvent: SyncEvent = {
      ...event,
      timestamp: new Date()
    };

    this.eventListeners.forEach(listener => {
      try {
        listener(fullEvent);
      } catch (error) {
        console.error('Error in sync event listener:', error);
      }
    });
  }

  public setInitialSyncInProgress(value: boolean): void {
    this._isInitialSyncInProgress = value;
    if (!value) {
      // Initial sync done, restart autoSync if configured
      this.startAutoSync();
    }
  }

  public isInitialSyncInProgress(): boolean {
    return this._isInitialSyncInProgress;
  }

  /**
   * Set sync status and emit event
   */
  private setStatus(status: SyncStatus, message?: string) {
    if (this.status !== status) {
      this.status = status;
      this.emit({
        type: 'status_change',
        status,
        message
      });
    }
  }

  /**
   * Build a ConnectionContext from private fields for ConnectionMonitor helpers.
   */
  private _connectionCtx() {
    // We return a proxy object that directly references `this` fields
    // so mutations in the helper are reflected on the SyncManager instance.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const sm = this;
    return {
      get isOnline() { return sm.isOnline; },
      set isOnline(v: boolean) { sm.isOnline = v; },
      connectionState: this.connectionState,
      syncMetrics: this.syncMetrics,
      get lastUserActivity() { return sm.lastUserActivity; },
      set lastUserActivity(v: Date) { sm.lastUserActivity = v; },
      get currentSyncInterval() { return sm.currentSyncInterval; },
      set currentSyncInterval(v: number) { sm.currentSyncInterval = v; },
      currentConfig: this.currentConfig,
      activityConfig: this.activityConfig,
      get cleanupInterval() { return sm.cleanupInterval; },
      set cleanupInterval(v: NodeJS.Timeout | null) { sm.cleanupInterval = v; },
      setStatus: (status: SyncStatus, msg?: string) => this.setStatus(status, msg),
      triggerSync: () => this.triggerSync(),
      stopAutoSync: () => this.stopAutoSync(),
      startAutoSync: () => this.startAutoSync(),
      performCleanup: () => this.performCleanup(),
    };
  }

  // Helper to build PullContext
  private _pullCtx(): PullContext {
    return {
      masterUserId: this.masterUserId!,
      syncCache: this.syncCache,
      syncMetrics: this.syncMetrics,
      mapTableName: this.mapTableName.bind(this),
      emit: this.emit.bind(this),
      isOnline: this.isOnline,
      tableSyncInProgress: this._tableSyncInProgress,
      currentConfig: {
        conflictResolution: this.currentConfig.conflictResolution
      }
    };
  }

  // Helper to build PartialSyncContext
  private _partialCtx(): PartialSyncContext {
    return {
      ...this._pullCtx(),
      setStatus: this.setStatus.bind(this),
      updateSyncMetrics: this.updateSyncMetrics.bind(this)
    };
  }

  /**
   * Setup online/offline detection with enhanced connection monitoring
   * @delegate ConnectionMonitor.setupOnlineDetection
   */
  private setupOnlineDetection() {
    this._cleanupOnlineDetection = _setupOnlineDetection(this._connectionCtx());
  }

  /**
   * Setup activity detection for dynamic sync intervals
   * @delegate ConnectionMonitor.setupActivityDetection
   */
  private setupActivityDetection() {
    this._cleanupActivityDetection = _setupActivityDetection(this._connectionCtx());
  }

  /**
   * Setup automatic cleanup scheduler
   * @delegate ConnectionMonitor.setupCleanupScheduler
   */
  private setupCleanupScheduler() {
    _setupCleanupScheduler(this._connectionCtx());
  }







  /**
 * Perform automatic cleanup of sync queue and cache
 * @delegate SyncMetricsAndCleanup.performCleanup
 */
  private async performCleanup(): Promise<void> {
    return _performCleanup(this.syncCache, this.compressionCache);
  }

  /**
   * Start auto-sync interval (Idle Sync Strategy)
   * Runs every 15 minutes to reduce server load and UI jitter.
   * @param runImmediate - If true, runs a sync immediately. Defaults to true.
   */
  startAutoSync(runImmediate: boolean = true): void {
    if (this.syncInterval) return;
    if (!this.currentConfig.autoSync) return;

    console.log(`SyncManager: Starting auto-sync (15 minute interval, immediate=${runImmediate})`);

    // Initial sync on start
    if (runImmediate) {
      this.sync().catch(console.error);
    }

    // Use dynamic interval
    const interval = this.currentSyncInterval || 900000;
    console.log(`SyncManager: Scheduling auto-sync with interval ${interval}ms`);

    this.syncInterval = setInterval(() => {
      console.log('SyncManager: Executing scheduled sync...');
      this.sync().catch(console.error);
    }, interval);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Manually trigger sync and reset idle timer
   */
  async triggerSync(): Promise<void> {
    if (!this.isOnline) {
      this.setStatus(SyncStatus.OFFLINE, 'Cannot sync while offline');
      return;
    }

    if (!this.masterUserId) {
      throw new Error('Master user ID not set');
    }

    // Stop existing timer to prevent double sync
    this.stopAutoSync();

    try {
      await this.sync();
    } finally {
      // Restart timer if auto-sync is enabled
      if (this.currentConfig.autoSync) {
        // Skip immediate sync as we just finished one
        this.startAutoSync(false);
      }
    }
  }

  /**
   * Clear local cache (wipe DB) and force re-sync from server
   * Does NOT propagate deletions to server.
   */
  async clearCacheAndResync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot clear cache and resync while offline');
    }

    if (!this.masterUserId) {
      throw new Error('Master user ID not set');
    }

    try {
      this.setStatus(SyncStatus.SYNCING, 'Clearing local cache...');

      // Stop auto sync to prevent interference
      const wasAutoSync = this.currentConfig.autoSync;
      this.stopAutoSync();

      // Start cache clear mode (disable sync hooks)
      db.startCacheClear();

      // Wipe all local data
      await db.clearAllData();

      // End cache clear mode
      db.endCacheClear();

      // Clear sync queue specifically to be safe
      await db.syncQueue.clear();

      this.setStatus(SyncStatus.SYNCING, 'Re-fetching data from server...');

      // Force full pull from server
      await this.pullFromServerWithCache();

      // Restart auto sync if it was enabled
      if (wasAutoSync) {
        // Skip immediate sync as we just finished one
        this.startAutoSync(false);
      }

      this.setStatus(SyncStatus.IDLE, 'Cache cleared and synced');
      this.emit({
        type: 'sync_complete',
        message: 'Cache cleared and re-synced successfully'
      });

    } catch (error) {
      console.error('Error clearing cache and resyncing:', error);
      db.endCacheClear(); // Ensure hooks are re-enabled
      this.setStatus(SyncStatus.ERROR, 'Failed to clear cache');
      throw error;
    }
  }

  /**
   * Enhanced main sync method with Promise-based lock.
   * Concurrent callers will await the existing sync instead of starting a new one.
   */
  async sync(): Promise<void> {
    // Promise-based lock: if sync is already running, piggyback on existing promise
    if (this._syncPromise) {
      console.log('SyncManager: sync() already running, awaiting existing');
      return this._syncPromise;
    }

    this._syncPromise = this._doSync();
    try {
      await this._syncPromise;
    } finally {
      this._syncPromise = null;
    }
  }

  /**
   * Internal sync implementation.
   */
  private async _doSync(): Promise<void> {
    const syncStartTime = Date.now();
    this.setStatus(SyncStatus.SYNCING, 'Starting sync');

    try {
      // Use UserContextManager for in-memory auth check (no API call)
      const user = await userContextManager.getCurrentUser();

      if (!user) {
        console.warn('Sync skipped: User not authenticated');
        this.setStatus(SyncStatus.IDLE, 'Waiting for authentication');
        return;
      }

      // Get pending sync operations with priority sorting
      const pendingOps = await this.getPrioritizedSyncOperations();

      // Process pending PUSH operations if any exist
      if (pendingOps.length > 0) {
        this.emit({
          type: 'sync_start',
          message: `Syncing ${pendingOps.length} operations`,
          total: pendingOps.length
        });

        // Process operations in optimized batches with progress tracking
        let processedCount = 0;
        for (let i = 0; i < pendingOps.length; i += this.currentConfig.batchSize) {
          const batch = pendingOps.slice(i, i + this.currentConfig.batchSize);
          await this.processBatchWithRetry(batch);

          processedCount += batch.length;
          this.emit({
            type: 'progress_update',
            progress: processedCount,
            total: pendingOps.length,
            message: `Processed ${processedCount}/${pendingOps.length} operations`
          });
        }
      }

      // ALWAYS pull updates from server (don't skip based on pending ops count)
      await this.pullFromServerWithCache();

      // Update sync metrics
      const syncDuration = Date.now() - syncStartTime;
      this.updateSyncMetrics(syncDuration, pendingOps.length);

      this.setStatus(SyncStatus.IDLE, 'Sync completed');
      this.connectionState.consecutiveFailures = 0;

      this.emit({
        type: 'sync_complete',
        message: `Sync completed successfully in ${syncDuration}ms`,
        total: pendingOps.length
      });

    } catch (error) {
      const syncDuration = Date.now() - syncStartTime;
      console.error(`Sync error (duration: ${syncDuration}ms):`, error);
      this.syncMetrics.failedOperations++;

      // Determine if this is a recoverable error
      const isRecoverable = this.isRecoverableError(error);

      if (isRecoverable) {
        this.connectionState.consecutiveFailures++;

        if (this.connectionState.consecutiveFailures <= 3) {
          this.setStatus(SyncStatus.RECONNECTING, `Sync failed, retrying (${this.connectionState.consecutiveFailures}/3)`);
          // Schedule retry with exponential backoff
          setTimeout(() => {
            if (this.isOnline) {
              this.sync();
            }
          }, this.getRetryDelay());
        } else {
          this.setStatus(SyncStatus.ERROR, error instanceof Error ? error.message : 'Sync failed (Retries exhausted)');
        }
      } else {
        // Non-recoverable immediately fails
        this.setStatus(SyncStatus.ERROR, error instanceof Error ? error.message : 'Sync failed');
      }

      this.emit({
        type: 'sync_error',
        error: error instanceof Error ? error : new Error('Unknown sync error'),
        message: isRecoverable ? 'Sync failed, will retry automatically' : 'Sync failed permanently'
      });
    }
  }

  /**
 * Get prioritized sync operations
 * @delegate SyncQueue.getPrioritizedSyncOperations
 */
  private async getPrioritizedSyncOperations(): Promise<PrioritySyncOperation[]> {
    return _getPrioritizedSyncOperations();
  }



  /**
   * Check if error is recoverable
   */
  private isRecoverableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString();

    // Network-related errors are recoverable
    const recoverablePatterns = [
      'network',
      'timeout',
      'connection',
      'offline',
      'fetch',
      'ECONNREFUSED',
      'ENOTFOUND'
    ];

    return recoverablePatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get retry delay with exponential backoff
   */
  private getRetryDelay(): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = this.currentConfig.maxBackoffDelay;
    const backoffMultiplier = this.currentConfig.retryBackoffMultiplier;

    const delay = Math.min(
      baseDelay * Math.pow(backoffMultiplier, this.connectionState.consecutiveFailures),
      maxDelay
    );

    return delay;
  }

  /**
 * Update sync metrics after successful sync
 * @delegate SyncMetricsAndCleanup.updateSyncMetrics
 */
  private updateSyncMetrics(syncDuration: number, operationsCount: number): void {
    _updateSyncMetrics(this.syncMetrics, syncDuration, operationsCount);
  }

  /**
   * Process a batch of sync operations with enhanced retry logic
   * @delegate SyncPushOperations.processBatchWithRetry
   */
  private async processBatchWithRetry(operations: PrioritySyncOperation[]): Promise<void> {
    return _processBatchWithRetry({ currentConfig: this.currentConfig, retryDelays: this.retryDelays, mapTableName: (t) => this.mapTableName(t) }, operations);
  }











  /**
   * Pull updates from server with caching and compression
   * @delegate SyncPullOperations.pullFromServerWithCache
   */
  private async pullFromServerWithCache(): Promise<void> {
    return _pullFromServerWithCache(this._pullCtx());
  }

  /**
   * Resolve conflicts between local and remote data with intelligent timestamp comparison
   */


  /**
   * Validate and normalize timestamp with comprehensive error handling
   */


  /**
   * Pull updates for a specific table from server
   */
  /**
   * Pull updates for a specific table from server
   * @param options Configuration options
   */
  /**
   * Pull updates for a specific table from server
   * @delegate SyncPullOperations.pullTableFromServer
   */
  public async pullTableFromServer(tableName: string, options?: { backgroundProcessing?: boolean; fastImport?: boolean; force?: boolean }): Promise<void> {
    return _pullTableFromServer(this._pullCtx(), tableName, options);
  }

  /**
   * INTERNAL: Fetch records from server (RPC or Standard Query)
   */


  /**
   * INTERNAL: Process records (Conflict Resolution & Saving)
   */

  /**
   * Get last sync time for a table
   * Validates the stored timestamp to prevent sending corrupted values to the server.
   */


  /**
   * Map local table names to Supabase table names
   * FIXED: Corrected table mappings to match actual Supabase schema
   */
  private mapTableName(tableName: string): string {
    const mapping: Record<string, string> = {
      contacts: 'contacts',
      groups: 'groups',                    // FIXED: was 'contact_groups'
      templates: 'templates',
      activityLogs: 'history',             // Supabase table is 'history', not 'activity_logs'
      assets: 'assets',
      quotas: 'user_quotas',               // FIXED: was 'quotas'
      profiles: 'profiles',
      payments: 'payments',
      quotaReservations: 'quota_reservations',
      userSessions: 'user_sessions',
      teams: 'teams',                      // Added: maps to 'teams' table
      messages: 'messages'                 // Added: maps to 'messages' table
    };

    return mapping[tableName] || tableName;
  }

  /**
   * Enhanced add operation to sync queue with priority and compression support
   */
  async addToSyncQueue(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    data: any,
    priority: SyncPriority = SyncPriority.NORMAL
  ): Promise<void> {
    // Validate data before queuing
    const validatedData = validateData(data, table as any);
    if (!validatedData) {
      logValidationError('sync_queue', table, data, new Error('Validation failed'));
      throw new Error(`Invalid data for ${table} sync operation`);
    }

    // Compress data if enabled
    let processedData = validatedData;
    if (this.currentConfig.compressionEnabled && operation !== 'delete') {
      processedData = await this.compressData(validatedData);
    }

    const syncOperation: SyncOperation = {
      table,
      operation,
      recordId,
      data: processedData,
      timestamp: nowISO(),
      retryCount: 0,
      status: 'pending'
    };

    await db.syncQueue.add(syncOperation);

    // Update activity timestamp for dynamic sync intervals
    this.lastUserActivity = new Date();

    // Trigger immediate sync for critical operations
    if (priority === SyncPriority.CRITICAL && this.isOnline) {
      setTimeout(() => this.triggerSync(), 100);
    }
  }

  /**
   * Compress data for efficient sync
   * @delegate SyncMetricsAndCleanup.compressData
   */
  private async compressData(data: any): Promise<any> {
    return _compressData(data, this.compressionCache, this.syncMetrics);
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**

  /**
   * Get comprehensive sync statistics and metrics
   * @delegate SyncMetricsAndCleanup.getSyncStats
   */
  async getSyncStats() {
    return _getSyncStats({
      status: this.status,
      isOnline: this.isOnline,
      connectionState: this.connectionState,
      syncMetrics: this.syncMetrics,
      syncCache: this.syncCache,
      compressionCache: this.compressionCache,
      retryDelays: this.retryDelays,
      currentSyncInterval: this.currentSyncInterval,
      lastUserActivity: this.lastUserActivity,
      activityConfig: this.activityConfig,
      currentConfig: this.currentConfig,
    });
  }

  /**
   * Get detailed sync logs for debugging
   */
  getSyncLogs(_limit: number = 50): SyncEvent[] {
    // In a real implementation, this would store logs in a circular buffer
    // For now, return empty array as logs are handled via events
    return [];
  }

  /**
   * Force cleanup of sync queue (admin function)
   */
  async forceCleanup(): Promise<void> {
    await this.performCleanup();
    console.log('Forced cleanup completed');
  }

  /**
   * Reset sync metrics
   * @delegate SyncMetricsAndCleanup.createDefaultMetrics
   */
  resetMetrics(): void {
    this.syncMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageSyncTime: 0,
      lastSyncTime: new Date(0),
      dataTransferred: 0,
      compressionRatio: 1.0,
      connectionQuality: this.connectionState.quality
    };
  }

  /**
   * Perform partial sync of specified tables with percentage limit
   */
  /**
   * Perform partial sync of specified tables with percentage limit
   * @delegate PartialSyncStrategy.partialSync
   */
  async partialSync(tables: string[], percentage: number = 0.5): Promise<void> {
    return _partialSync(this._partialCtx(), tables, percentage);
  }

  /**
   * Calculate record limit for partial sync based on percentage
   */
  /**
   * Continue sync in background for remaining records
   * @delegate PartialSyncStrategy.backgroundSync
   */
  async backgroundSync(tables: string[]): Promise<void> {
    return _backgroundSync(this._partialCtx(), tables);
  }

  /**
   * Clear all sync timestamps from local storage
   * Used when clearing user data to ensure fresh sync on next login
   */
  async clearSyncTimestamps(): Promise<void> {
    try {
      const tables = db.getSyncableTables();
      for (const table of tables) {
        const key = `last_sync_${table}`;
        localStorage.removeItem(key);
      }
      console.log('Cleared all sync timestamps');
    } catch (error) {
      console.error('Error clearing sync timestamps:', error);
    }
  }

  /**
   * Enhanced cleanup with comprehensive resource management
   */
  destroy() {
    this.stopAutoSync();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }

    this.eventListeners = [];
    this.syncCache.clear();
    this.compressionCache.clear();
    this.retryDelays.clear();

    // Properly clean up ConnectionMonitor listeners and intervals
    if (this._cleanupOnlineDetection) {
      this._cleanupOnlineDetection();
      this._cleanupOnlineDetection = null;
    }
    if (this._cleanupActivityDetection) {
      this._cleanupActivityDetection();
      this._cleanupActivityDetection = null;
    }

    console.log('SyncManager destroyed and resources cleaned up');
  }
}

export const syncManager = new SyncManager();