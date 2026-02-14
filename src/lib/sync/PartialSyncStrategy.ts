/**
 * PartialSyncStrategy.ts — Partial and background sync strategies.
 *
 * Extracted from SyncManager.ts (Phase 5 refactoring).
 * Stateless helper functions — receive context as parameter.
 */

import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { nowISO } from '@/lib/utils/timestamp';
import { validateData } from '@/lib/utils/validation';
import {
    SyncStatus,

} from './SyncTypes';
import {
    getLastSyncTime,
    setLastSyncTime,
    normalizeServerRecordTimestamps,
    resolveConflict,
    PullContext
} from './SyncPullOperations';

// ─── Context Interface ───────────────────────────────────

export interface PartialSyncContext extends PullContext {
    setStatus: (status: SyncStatus, msg?: string) => void;
    updateSyncMetrics: (duration: number, count: number) => void;
}

// ─── Partial Limit Calculation ───────────────────────────

/**
 * Calculate record limit for partial sync based on percentage
 */
export async function calculateRecordLimit(ctx: PartialSyncContext, tableName: string, percentage: number): Promise<number> {
    // For different tables, we might want to prioritize different records
    let totalRecords = 0;

    const localTable = db.table(tableName as any);
    totalRecords = await localTable.count();

    // If there are no records locally, fetch some from the server
    if (totalRecords === 0) {
        // Fetch count from server
        const supabaseTable = ctx.mapTableName(tableName);
        const { count, error } = await supabase
            .from(supabaseTable)
            .select('id', { count: 'exact', head: true })
            .eq('master_user_id', ctx.masterUserId);

        if (error) {
            console.error(`Error counting records in ${tableName}:`, error);
            // Default to 100 records if we can't get the count
            return Math.max(1, Math.floor(100 * percentage));
        }

        totalRecords = count || 0;
    }

    const recordLimit = Math.max(1, Math.floor(totalRecords * percentage));

    // For certain tables, we might want to adjust the limit based on importance
    switch (tableName) {
        case 'contacts':
            // Prioritize most recently used contacts
            return Math.min(recordLimit, 1000); // Cap at 1000 for contacts
        case 'templates':
            // Prioritize most used templates
            return Math.min(recordLimit, 500); // Cap at 500 for templates
        case 'assets':
            // Prioritize more recent assets (may be larger files)
            return Math.min(recordLimit, 100); // Cap at 100 for assets to avoid large downloads
        default:
            return Math.min(recordLimit, 500); // General cap
    }
}

// ─── Pull Operations with Limit ──────────────────────────

/**
 * Pull updates for a specific table from server with record limit
 */
export async function pullTableFromServerWithLimit(ctx: PartialSyncContext, tableName: string, recordLimit?: number): Promise<void> {
    const supabaseTable = ctx.mapTableName(tableName);
    const localTable = db.table(tableName as any);

    // Get last sync timestamp for this table
    const lastSync = await getLastSyncTime(tableName);

    // Use appropriate timestamp field based on table
    let timestampField = 'updated_at';
    if (tableName === 'userSessions') {
        timestampField = 'last_active';
    }

    // Fetch updated records from server with optional limit
    console.log(`SyncManager: Pulling ${tableName} from server. MasterID: ${ctx.masterUserId}, LastSync: ${lastSync}`);

    let serverRecords: any[] | null = null;
    let error: any = null;

    if (tableName === 'contacts') {
        // For contacts, we ALWAYS use RPC to bypass limits and ensure full sync
        // Partial sync for contacts doesn't make sense if we want consistency
        console.log('SyncManager: pullTableFromServerWithLimit - Upgrading to RPC for contacts');
        const result = await supabase.rpc('sync_pull_contacts', { p_master_user_id: ctx.masterUserId });
        serverRecords = result.data;
        error = result.error;
    } else {
        let query = supabase
            .from(supabaseTable)
            .select('*')
            .eq('master_user_id', ctx.masterUserId)
            .gte(timestampField, lastSync);

        if (recordLimit) {
            query = query.limit(recordLimit);
        }

        const result = await query;
        serverRecords = result.data;
        error = result.error;
    }

    if (error) {
        console.error(`SyncManager: Error pulling ${tableName}:`, error);
        throw error;
    }

    console.log(`SyncManager: Pulled ${serverRecords?.length || 0} records for ${tableName} from server`);

    if (!serverRecords || serverRecords.length === 0) return;

    // Process each server record with enhanced conflict resolution
    for (const serverRecord of serverRecords) {
        try {
            // Ensure server record timestamps are in consistent ISO string format
            const normalizedServerRecord = normalizeServerRecordTimestamps(serverRecord);

            const localRecord = await localTable.get(normalizedServerRecord.id);

            if (!localRecord) {
                // New record from server - add to local with validation
                const validatedData = validateData(normalizedServerRecord, tableName as any);
                if (validatedData) {
                    const localRecord = {
                        ...validatedData,
                        _syncStatus: 'synced' as const,
                        _lastModified: nowISO(),
                        _version: 1,
                        _deleted: false
                    };
                    await localTable.add(localRecord);
                    ctx.syncMetrics.totalOperations++;
                    ctx.syncMetrics.successfulOperations++;
                } else {
                    console.error(`Validation failed for new server record ${normalizedServerRecord.id} in ${tableName}`);
                    ctx.syncMetrics.failedOperations++;
                }
            } else {
                // Check for conflicts using enhanced resolution
                const conflictResult = await resolveConflict(ctx, tableName, normalizedServerRecord.id, localRecord, normalizedServerRecord);

                if (conflictResult.resolved) {
                    // Apply resolved data with normalized timestamps
                    const updatedRecord = {
                        ...normalizeServerRecordTimestamps(conflictResult.data),
                        _syncStatus: 'synced' as const,
                        _lastModified: nowISO(),
                        _version: (localRecord._version || 0) + 1,
                        _deleted: false
                    };

                    await localTable.update(normalizedServerRecord.id, updatedRecord);
                    ctx.syncMetrics.totalOperations++;
                    ctx.syncMetrics.successfulOperations++;

                    // Emit user notification for significant conflicts
                    if (conflictResult.userNotification) {
                        ctx.emit({
                            type: 'user_notification',
                            table: tableName,
                            recordId: normalizedServerRecord.id,
                            message: conflictResult.userNotification,
                            notificationType: 'warning',
                            userMessage: conflictResult.userNotification
                        });
                    }

                    // Log audit information
                    // console.log(`Conflict resolved: ${conflictResult.auditLog}`);
                } else {
                    console.error(`Failed to resolve conflict for ${tableName}:${normalizedServerRecord.id}`);
                    ctx.syncMetrics.failedOperations++;
                }
            }
        } catch (error) {
            console.error(`Error processing server record ${serverRecord.id} in ${tableName}:`, error);
            ctx.syncMetrics.failedOperations++;
        }
    }

    // Update last sync time
    await setLastSyncTime(tableName, nowISO());
}

/**
 * Pull remaining records for a table that weren't synced in partial sync
 */
export async function pullRemainingRecords(ctx: PartialSyncContext, tableName: string): Promise<void> {
    const supabaseTable = ctx.mapTableName(tableName);
    const localTable = db.table(tableName as any);

    // Get last sync timestamp for this table
    const lastSync = await getLastSyncTime(tableName);

    // Use appropriate timestamp field based on table
    let timestampField = 'updated_at';
    if (tableName === 'userSessions') {
        timestampField = 'last_active';
    }

    // Fetch records from server that haven't been synced yet
    console.log(`SyncManager: pullRemainingRecords - Pulling ${tableName} from server. MasterID: ${ctx.masterUserId}, LastSync: ${lastSync}`);

    let serverRecords: any[] | null = null;
    let error: any = null;

    if (tableName === 'contacts') {
        console.log('SyncManager: pullRemainingRecords - Upgrading to RPC for contacts');
        const result = await supabase.rpc('sync_pull_contacts', { p_master_user_id: ctx.masterUserId });
        serverRecords = result.data;
        error = result.error;
    } else {
        const result = await supabase
            .from(supabaseTable)
            .select('*')
            .eq('master_user_id', ctx.masterUserId)
            .gte(timestampField, lastSync);
        serverRecords = result.data;
        error = result.error;
    }

    if (error) {
        console.error(`SyncManager: pullRemainingRecords - Error pulling ${tableName}:`, error);
        return;
    }

    console.log(`SyncManager: pullRemainingRecords - Pulled ${serverRecords?.length || 0} records for ${tableName} from server`);

    if (!serverRecords || serverRecords.length === 0) return;

    // Process each server record
    for (const serverRecord of serverRecords) {
        try {
            const normalizedServerRecord = normalizeServerRecordTimestamps(serverRecord);
            const localRecord = await localTable.get(normalizedServerRecord.id);

            if (!localRecord) {
                const validatedData = validateData(normalizedServerRecord, tableName as any);
                if (validatedData) {
                    const localRecord = {
                        ...validatedData,
                        _syncStatus: 'synced' as const,
                        _lastModified: nowISO(),
                        _version: 1,
                        _deleted: false
                    };
                    await localTable.add(localRecord);
                    ctx.syncMetrics.totalOperations++;
                    ctx.syncMetrics.successfulOperations++;
                } else {
                    console.error(`Validation failed for new server record ${normalizedServerRecord.id} in ${tableName}`);
                    ctx.syncMetrics.failedOperations++;
                }
            } else {
                const conflictResult = await resolveConflict(ctx, tableName, normalizedServerRecord.id, localRecord, normalizedServerRecord);

                if (conflictResult.resolved) {
                    const updatedRecord = {
                        ...normalizeServerRecordTimestamps(conflictResult.data),
                        _syncStatus: 'synced' as const,
                        _lastModified: nowISO(),
                        _version: (localRecord._version || 0) + 1,
                        _deleted: false
                    };
                    await localTable.update(normalizedServerRecord.id, updatedRecord);
                    ctx.syncMetrics.totalOperations++;
                    ctx.syncMetrics.successfulOperations++;
                } else {
                    console.error(`Failed to resolve conflict for ${tableName}:${normalizedServerRecord.id}`);
                    ctx.syncMetrics.failedOperations++;
                }
            }
        } catch (error) {
            console.error(`Error processing server record ${serverRecord.id} in ${tableName}:`, error);
            ctx.syncMetrics.failedOperations++;
        }
    }

    // Update last sync time
    await setLastSyncTime(tableName, nowISO());
}

// ─── Top-Level Strategies ────────────────────────────────

/**
 * Perform partial sync of specified tables with percentage limit
 */
export async function partialSync(ctx: PartialSyncContext, tables: string[], percentage: number = 0.5): Promise<void> {
    if (!ctx.isOnline) {
        ctx.setStatus(SyncStatus.OFFLINE, 'Cannot sync while offline');
        return;
    }

    if (!ctx.masterUserId) {
        throw new Error('Master user ID not set');
    }

    const syncStartTime = Date.now();
    ctx.setStatus(SyncStatus.SYNCING, `Starting partial sync for ${tables.length} tables at ${percentage * 100}%`);

    try {
        ctx.emit({
            type: 'sync_start',
            message: `Partial sync of ${tables.length} tables at ${percentage * 100}%`,
            total: tables.length
        });

        let completedTables = 0;
        for (const tableName of tables) {
            try {
                // Calculate record limit based on percentage
                const recordLimit = percentage >= 1.0 ?
                    undefined :
                    await calculateRecordLimit(ctx, tableName, percentage);

                await pullTableFromServerWithLimit(ctx, tableName, recordLimit);

                completedTables++;
                ctx.emit({
                    type: 'progress_update',
                    progress: completedTables,
                    total: tables.length,
                    message: `Processed ${completedTables}/${tables.length} tables`
                });
            } catch (tableError) {
                console.error(`Error syncing table ${tableName}:`, tableError);
                // Continue with other tables instead of stopping the entire sync
            }
        }

        const syncDuration = Date.now() - syncStartTime;
        ctx.updateSyncMetrics(syncDuration, completedTables);

        ctx.setStatus(SyncStatus.IDLE, 'Partial sync completed');

        ctx.emit({
            type: 'sync_complete',
            message: `Partial sync completed in ${syncDuration}ms for ${completedTables}/${tables.length} tables`,
            total: completedTables
        });
    } catch (error) {
        const syncDuration = Date.now() - syncStartTime;
        console.error(`Partial sync error (duration: ${syncDuration}ms):`, error);
        ctx.setStatus(SyncStatus.ERROR, error instanceof Error ? error.message : 'Partial sync failed');

        ctx.emit({
            type: 'sync_error',
            error: error instanceof Error ? error : new Error('Unknown sync error'),
            message: 'Partial sync failed'
        });
    }
}

/**
 * Continue sync in background for remaining records
 */
export async function backgroundSync(ctx: PartialSyncContext, tables: string[]): Promise<void> {
    if (!ctx.isOnline) {
        console.log('Skipping background sync - offline');
        return;
    }

    if (!ctx.masterUserId) {
        console.log('Skipping background sync - no master user ID');
        return;
    }

    console.log(`Starting background sync for ${tables.length} tables`);
    ctx.emit({
        type: 'sync_start',
        message: `Background sync for ${tables.length} tables`,
        notificationType: 'info'
    });

    // Run in background without blocking UI
    setTimeout(async () => {
        try {
            ctx.setStatus(SyncStatus.SYNCING, 'Background sync in progress');

            let completedTables = 0;
            for (const tableName of tables) {
                try {
                    await pullRemainingRecords(ctx, tableName);
                    completedTables++;
                } catch (tableError) {
                    console.error(`Error in background sync for table ${tableName}:`, tableError);
                }
            }

            ctx.setStatus(SyncStatus.IDLE, 'Background sync completed');
            console.log(`Background sync completed for ${completedTables}/${tables.length} tables`);

            ctx.emit({
                type: 'sync_complete',
                message: `Background sync completed for ${completedTables} tables`,
                notificationType: 'success'
            });
        } catch (error) {
            console.error('Background sync error:', error);
            ctx.emit({
                type: 'sync_error',
                error: error instanceof Error ? error : new Error('Background sync failed'),
                message: 'Background sync failed',
                notificationType: 'error'
            });
        }
    }, 0); // Use setTimeout to yield to main thread
}
