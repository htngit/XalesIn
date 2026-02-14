/**
 * SyncPullOperations.ts — Pull operation helper functions.
 *
 * Extracted from SyncManager.ts (Phase 5 refactoring).
 * Stateless helper functions — receive context as parameter.
 */

import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
    isValidTimestamp,
    compareTimestamps,
    normalizeTimestamp,
    nowISO
} from '@/lib/utils/timestamp';
import { validateData } from '@/lib/utils/validation';
import { ConflictResolution, ConflictResolutionResult, SyncStatus, SyncMetrics } from './SyncTypes';

// ─── Context Interface ───────────────────────────────────

export interface PullContext {
    masterUserId: string;
    syncCache: Map<string, any>;
    syncMetrics: SyncMetrics;
    mapTableName: (table: string) => string;
    emit: (event: any) => void;
    // For checking if we should proceed with sync
    isOnline: boolean;
    // For tracking ongoing table syncs
    tableSyncInProgress: Map<string, boolean>;
    // Config access
    currentConfig: {
        conflictResolution: ConflictResolution;
    };
}

// ─── Shared State Helpers ────────────────────────────────

/**
 * Get last sync time for a table
 * Validates the stored timestamp to prevent sending corrupted values to the server.
 */
export async function getLastSyncTime(tableName: string): Promise<string> {
    const key = `last_sync_${tableName}`;
    const stored = localStorage.getItem(key);
    const epoch = new Date(0).toISOString();

    if (!stored) return epoch;

    // Validate: check if it's a parseable date string
    const parsed = new Date(stored);
    if (isNaN(parsed.getTime())) {
        console.warn(`Invalid last_sync timestamp found for ${tableName}: ${stored}. Resetting to epoch.`);
        return epoch;
    }

    return stored;
}

/**
 * Set last sync time for a table
 */
export async function setLastSyncTime(tableName: string, date: string): Promise<void> {
    const key = `last_sync_${tableName}`;
    localStorage.setItem(key, date);
}

// ─── Data Normalization & Validation ─────────────────────

/**
 * Validate and normalize timestamp with comprehensive error handling
 */
export function validateAndNormalizeTimestamp(timestamp: any): string | null {
    try {
        if (!timestamp) {
            // console.warn('Timestamp is null or undefined'); // Too noisy
            return null;
        }

        // Try to normalize the timestamp
        const normalized = normalizeTimestamp(timestamp);

        // Validate the normalized timestamp
        if (!isValidTimestamp(normalized)) {
            console.error(`Invalid timestamp after normalization: ${timestamp} -> ${normalized}`);
            return null;
        }

        return normalized;
    } catch (error) {
        console.error('Error validating timestamp:', error, 'Input:', timestamp);
        return null;
    }
}

/**
 * Normalize server record timestamps to ensure consistent ISO string format
 */
export function normalizeServerRecordTimestamps(record: any): any {
    const normalized = { ...record };

    if (normalized.created_at) {
        normalized.created_at = normalizeTimestamp(normalized.created_at);
    }

    if (normalized.updated_at) {
        normalized.updated_at = normalizeTimestamp(normalized.updated_at);
    }

    if (normalized.last_active) {
        normalized.last_active = normalizeTimestamp(normalized.last_active);
    }

    // Ensure ID is string
    if (normalized.id && typeof normalized.id !== 'string') {
        normalized.id = String(normalized.id);
    }

    return normalized;
}

// ─── Conflict Resolution ─────────────────────────────────

/**
 * Merge data from local and remote sources
 */
export function mergeData(localData: any, remoteData: any): any {
    // Simple merge strategy: remote data takes precedence for server-controlled fields,
    // local data preserved for user-specific fields
    const merged = { ...remoteData };

    // Preserve local sync metadata
    if (localData._syncStatus) merged._syncStatus = localData._syncStatus;
    if (localData._lastModified) merged._lastModified = localData._lastModified;
    if (localData._version) merged._version = Math.max(localData._version || 0, remoteData._version || 0) + 1;

    // For certain fields, prefer local data if it exists and remote doesn't
    const preferLocalFields = ['notes', 'tags', 'is_blocked'];
    preferLocalFields.forEach(field => {
        if (localData[field] && !remoteData[field]) {
            merged[field] = localData[field];
        }
    });

    return merged;
}

/**
 * Resolve conflicts between local and remote data with intelligent timestamp comparison
 */
export async function resolveConflict(
    ctx: PullContext,
    tableName: string,
    recordId: string,
    localData: any,
    remoteData: any
): Promise<ConflictResolutionResult> {
    try {
        // Validate timestamps
        const localTimestamp = validateAndNormalizeTimestamp(localData._lastModified || localData.updated_at);
        const remoteTimestamp = validateAndNormalizeTimestamp(remoteData.updated_at);

        if (!localTimestamp || !remoteTimestamp) {
            // If timestamps are invalid, prefer remote data for safety
            return {
                resolved: true,
                winner: 'remote',
                data: remoteData,
                userNotification: 'Data conflict resolved automatically due to invalid timestamps',
                auditLog: `Conflict resolved for ${tableName}:${recordId} - invalid timestamps, chose remote`
            };
        }

        // Compare timestamps
        const comparison = compareTimestamps(localTimestamp, remoteTimestamp);

        let winner: 'local' | 'remote' | 'merged';
        let finalData: any;
        let userMessage = '';
        let auditMessage = '';

        switch (ctx.currentConfig.conflictResolution) {
            case ConflictResolution.LAST_WRITE_WINS:
                if (comparison > 0) {
                    // Local is newer
                    winner = 'local';
                    finalData = localData;
                    auditMessage = `Last-write-wins: local data chosen (${localTimestamp} > ${remoteTimestamp})`;
                } else if (comparison < 0) {
                    // Remote is newer
                    winner = 'remote';
                    finalData = remoteData;
                    auditMessage = `Last-write-wins: remote data chosen (${remoteTimestamp} > ${localTimestamp})`;
                } else {
                    // Same timestamp - merge if possible
                    winner = 'merged';
                    finalData = mergeData(localData, remoteData);
                    auditMessage = `Last-write-wins: data merged (same timestamp)`;
                }
                break;

            case ConflictResolution.REMOTE_WINS:
                winner = 'remote';
                finalData = remoteData;
                auditMessage = `Remote-wins strategy: remote data chosen`;
                break;

            case ConflictResolution.LOCAL_WINS:
                winner = 'local';
                finalData = localData;
                auditMessage = `Local-wins strategy: local data chosen`;
                break;

            case ConflictResolution.MANUAL:
                // For manual resolution, emit event and keep local data for now
                winner = 'local';
                finalData = localData;
                userMessage = `Conflict detected in ${tableName}. Please review and resolve manually.`;
                auditMessage = `Manual resolution required for ${tableName}:${recordId}`;
                break;

            default:
                winner = 'remote';
                finalData = remoteData;
                auditMessage = `Default strategy: remote data chosen`;
        }

        // Log significant conflicts
        if (Math.abs(comparison) > 300000) { // More than 5 minutes difference
            userMessage = userMessage || `Significant data conflict resolved in ${tableName}.`;
            // console.warn(`Significant conflict detected: ${auditMessage}`);
        }

        return {
            resolved: true,
            winner,
            data: finalData,
            userNotification: userMessage,
            auditLog: auditMessage
        };

    } catch (error) {
        console.error('Error resolving conflict:', error);
        // Fallback to remote wins on error
        return {
            resolved: true,
            winner: 'remote',
            data: remoteData,
            userNotification: 'Conflict resolution failed, using server data',
            auditLog: `Conflict resolution error for ${tableName}:${recordId}, fell back to remote`
        };
    }
}

// ─── Fetch & Process ─────────────────────────────────────

/**
 * INTERNAL: Fetch records from server (RPC or Standard Query)
 */
export async function _fetchServerRecords(ctx: PullContext, tableName: string): Promise<any[] | null> {
    const supabaseTable = ctx.mapTableName(tableName);
    const lastSync = await getLastSyncTime(tableName);

    // Use appropriate timestamp field based on table
    let timestampField = 'updated_at';
    if (tableName === 'userSessions') {
        timestampField = 'last_active';
    }

    console.log(`SyncManager: Fetching ${tableName} from server. MasterID: ${ctx.masterUserId}, LastSync: ${lastSync}`);

    let serverRecords: any[] | null = null;
    let error: any = null;

    if (tableName === 'contacts') {
        // Use RPC for contacts to bypass row limit
        // console.log('SyncManager: Using RPC sync_pull_contacts for contacts table', { lastSync });
        // Logic to decode JSON RPC Response
        const result = await supabase.rpc('sync_pull_contacts', {
            p_master_user_id: ctx.masterUserId,
            p_last_sync: lastSync
        });

        if (result.error) {
            console.error('SyncManager: RPC sync_pull_contacts failed:', result.error);
            throw result.error;
        }

        if (result.data) {
            // If RPC returns JSON, it might be nested or direct array depending on implementation
            // Our migration returns JSON directly.
            serverRecords = result.data as any[];
            // Return immediately to avoid falling through to standard query
            return serverRecords;
        } else {
            // If data is null/empty but no error, return empty array
            return [];
        }
    }

    // Standard Query (else removed implicitly by returning above)
    {
        // Standard Query
        const result = await supabase
            .from(supabaseTable)
            .select('*')
            .eq('master_user_id', ctx.masterUserId)
            .gte(timestampField, lastSync);
        serverRecords = result.data;
        error = result.error;
    }

    if (error) {
        console.error(`SyncManager: Error fetching ${tableName}:`, error);
        throw error;
    }

    return serverRecords;
}

/**
 * INTERNAL: Process records (Conflict Resolution & Saving)
 */
export async function _processServerRecords(
    ctx: PullContext,
    tableName: string,
    serverRecords: any[],
    options?: { fastImport?: boolean }
): Promise<void> {
    const localTable = db.table(tableName as any);
    let addedCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;
    const total = serverRecords.length;

    console.log(`SyncManager: Starting processing for ${tableName} (${total} records)`);

    ctx.emit({
        type: 'sync_progress',
        table: tableName,
        current: 0,
        total: total,
        phase: 'processing'
    });

    const CHUNK_SIZE = 50;

    // Fast Import Strategy (Bulk Insert)
    if (options?.fastImport) {
        console.log(`SyncManager: Fast Import Mode enabled for ${tableName}`);

        // Emit START progress for UI feedback (0%)
        ctx.emit({
            type: 'sync_progress',
            table: tableName,
            current: 0,
            total: total,
            phase: 'processing'
        });

        // Prepare all records for bulk insertion
        const bulkRecords = serverRecords.map(record => ({
            ...normalizeServerRecordTimestamps(record),
            _syncStatus: 'synced',
            _lastModified: nowISO(),
            _version: 1,
            _deleted: false
        }));

        await localTable.bulkPut(bulkRecords);

        addedCount = serverRecords.length;
        ctx.syncMetrics.successfulOperations += serverRecords.length;

        // Emit FINAL progress for UI feedback (100%)
        ctx.emit({
            type: 'sync_progress',
            table: tableName,
            current: total,
            total: total,
            phase: 'processing'
        });

        console.log(`SyncManager: Fast Import finished. Added ${addedCount} records.`);
    } else {
        // Normal Processing Loop
        for (let i = 0; i < total; i += CHUNK_SIZE) {
            const chunk = serverRecords.slice(i, i + CHUNK_SIZE);

            // Process chunk
            for (const [chunkIndex, serverRecord] of chunk.entries()) {
                const index = i + chunkIndex;

                try {
                    // Emit progress periodically
                    if (index % 50 === 0 || index === total - 1) {
                        ctx.emit({
                            type: 'sync_progress',
                            table: tableName,
                            current: index + 1,
                            total: total,
                            phase: 'processing'
                        });
                    }

                    const normalizedServerRecord = normalizeServerRecordTimestamps(serverRecord);
                    // Optimization: Check if record exists in local DB first to avoid unnecessary processing
                    const localRecord = await localTable.get(normalizedServerRecord.id);

                    if (!localRecord) {
                        // New Record
                        const validatedData = validateData(normalizedServerRecord, tableName as any);
                        if (validatedData) {
                            await localTable.add({
                                ...validatedData,
                                _syncStatus: 'synced',
                                _lastModified: nowISO(),
                                _version: 1,
                                _deleted: false
                            });
                            addedCount++;
                            ctx.syncMetrics.successfulOperations++;
                        } else {
                            ignoredCount++;
                        }
                    } else {
                        // Update / Conflict Logic
                        let shouldUpdate = false;

                        // GUARD: Protect pending local changes!
                        const hasPendingChanges = localRecord._syncStatus && localRecord._syncStatus !== 'synced';

                        if (hasPendingChanges) {
                            const serverTime = new Date(normalizedServerRecord.updated_at).getTime();
                            const localTime = new Date(localRecord.updated_at).getTime();

                            // Only force update if server is WAY newer (5 mins), assuming local change is stale/stuck
                            if (serverTime - localTime > 5 * 60 * 1000) {
                                console.warn(`SyncManager: Overwriting stuck local pending change for ${tableName}:${localRecord.id}`);
                                shouldUpdate = true;
                            } else {
                                // Protect local change
                                shouldUpdate = false;
                            }
                        }
                        else if (tableName === 'contacts') {
                            // Simplified Last Write Wins based on Timestamp
                            const serverTime = new Date(normalizedServerRecord.updated_at).getTime();
                            const localTime = new Date(localRecord.updated_at).getTime();
                            // Update if Server is newer
                            if (serverTime > localTime) {
                                shouldUpdate = true;
                            }
                        } else {
                            // Other tables: Server Wins (Default)
                            shouldUpdate = true;
                        }

                        if (shouldUpdate) {
                            await localTable.update(normalizedServerRecord.id, {
                                ...normalizeServerRecordTimestamps(normalizedServerRecord),
                                _syncStatus: 'synced',
                                _lastModified: nowISO(),
                                _version: (localRecord._version || 0) + 1,
                                _deleted: false
                            });
                            updatedCount++;
                            ctx.syncMetrics.successfulOperations++;
                        } else {
                            ignoredCount++;
                        }
                    }
                } catch (err) {
                    // console.error(`Error processing record ${serverRecord.id}:`, err);
                    ignoredCount++;
                }
            }

            // Yield to the event loop after each chunk to allow UI updates
            if (i + CHUNK_SIZE < total) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    console.log(`SyncManager: Finished processing ${tableName}. Added: ${addedCount}, Updated: ${updatedCount}, Ignored: ${ignoredCount}`);

    // Final completion event
    ctx.emit({
        type: 'sync_complete',
        table: tableName
    });

    // Update last sync time ONLY after successful processing
    await setLastSyncTime(tableName, nowISO());
}

/**
 * Helper to manage background lock release
 */
export async function _processServerRecordsWrapper(
    ctx: PullContext,
    tableName: string,
    serverRecords: any[],
    options?: { fastImport?: boolean }
): Promise<void> {
    try {
        await _processServerRecords(ctx, tableName, serverRecords, options);
    } finally {
        ctx.tableSyncInProgress.set(tableName, false);
    }
}

// ─── Top-Level Pull Methods ──────────────────────────────

/**
 * Pull updates for a specific table from server
 */
export async function pullTableFromServer(
    ctx: PullContext,
    tableName: string,
    options?: { backgroundProcessing?: boolean; fastImport?: boolean; force?: boolean }
): Promise<void> {
    // Check if sync already in progress for this table
    if (!options?.force && ctx.tableSyncInProgress.get(tableName)) {
        console.log(`SyncManager: Sync already in progress for ${tableName}, skipping`);
        return;
    }

    ctx.tableSyncInProgress.set(tableName, true);

    try {
        // 1. Fetch Phase (Blocking)
        const serverRecords = await _fetchServerRecords(ctx, tableName);

        if (!serverRecords || serverRecords.length === 0) {
            // console.log(`SyncManager: No new records for ${tableName}`);
            // Even if no records, update timestamp to prevent repeated checks
            await setLastSyncTime(tableName, nowISO());

            // Emit complete event so listeners (like Dashboard) know check is done
            ctx.emit({
                type: 'sync_complete',
                table: tableName,
                status: SyncStatus.IDLE
            });

            return;
        }

        console.log(`SyncManager: Fetched ${serverRecords.length} records for ${tableName}. Background Processing: ${options?.backgroundProcessing}`);

        // 2. Process Phase
        if (options?.backgroundProcessing) {
            // Fire and Forget - Process in background
            // Use wrapper to ensure lock is released when done
            _processServerRecordsWrapper(ctx, tableName, serverRecords, options).catch(err => {
                console.error(`SyncManager: Background processing failed for ${tableName}`, err);
                // Lock release is handled in wrapper's finally block
            });
            // Return immediately to allow UI to unblock
            return;
        } else {
            // Blocking - Wait for completion
            await _processServerRecords(ctx, tableName, serverRecords, options);
        }
    } finally {
        // For blocking calls (backgroundProcessing = false), release lock here.
        if (!options?.backgroundProcessing) {
            ctx.tableSyncInProgress.set(tableName, false);
        }
    }
}

/**
 * Pull updates from server with caching and compression
 */
export async function pullFromServerWithCache(ctx: PullContext): Promise<void> {
    if (!ctx.masterUserId) return;

    const tables = db.getSyncableTables();
    const cacheKey = `pull_cache_${ctx.masterUserId}_${Date.now()}`;

    try {
        // Check cache first for recent pulls
        // Note: Map.entries/values iteration not ideal here, but SyncManager used a simple Map.
        // SyncManager implementation used:
        // const cachedData = this.syncCache.get(cacheKey);
        // BUT cacheKey includes Date.now(), so it's a WRITE key.
        // The READ key logic in SyncManager was:
        // const cachedData = this.syncCache.get(cacheKey); ... wait, SyncManager source actually generated a NEW key every time?
        // Let's re-read SyncManager line 584: const cacheKey = `pull_cache_${this.masterUserId}_${Date.now()}`;
        // And line 588: const cachedData = this.syncCache.get(cacheKey);
        // This implies it NEVER hit the cache because the key is unique every millisecond!
        // That seems to be a BUG in the original code. 
        // However, I should replicate strictly or fix it?
        // "Safe refactoring" means replicating behavior. But this behavior is "no cache".
        // Use your judgement. I'll implement it as is, but maybe use a static key if I want it to actually work?
        // Actually, let's look at how SyncPushOperations did it.
        // Wait, line 584 logic: check if ANY key in syncCache matches? No, it used get(cacheKey).
        // So semanticially it was broken. I will preserve the code structure but maybe fixing it is out of scope for "extraction".
        // I'll keep it as is. It's safe (just inefficient).

        // Pull from each table with parallel processing for better performance
        const pullPromises = tables.map(tableName => pullTableFromServer(ctx, tableName));
        await Promise.allSettled(pullPromises);

        // Cache successful pull
        ctx.syncCache.set(cacheKey, {
            timestamp: Date.now(),
            data: { tables, timestamp: new Date() }
        });

        // Limit cache size
        if (ctx.syncCache.size > 10) {
            const oldestKey = ctx.syncCache.keys().next().value;
            if (oldestKey) {
                ctx.syncCache.delete(oldestKey);
            }
        }

    } catch (error) {
        console.error('Error in pullFromServerWithCache:', error);
        // Continue without caching on error
    }
}
