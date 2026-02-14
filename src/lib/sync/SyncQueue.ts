/**
 * SyncQueue.ts — Sync queue management functions.
 *
 * Extracted from SyncManager.ts (Phase 2 refactoring).
 * Stateless helper functions — receive SyncManager instance as context.
 */

import { db, SyncOperation } from '../db';
import { SyncPriority, PrioritySyncOperation } from './SyncTypes';
import { compareTimestamps, nowISO } from '../utils/timestamp';
import { validateData, logValidationError } from '../utils/validation';

// ─── Priority Determination ──────────────────────────────

/**
 * Determine operation priority based on operation type and table.
 */
export function determineOperationPriority(operation: SyncOperation): SyncPriority {
    // Critical operations that affect user experience
    if (operation.operation === 'delete' ||
        (operation.table === 'quotas' && operation.operation === 'update')) {
        return SyncPriority.CRITICAL;
    }

    // High priority for user-initiated changes
    if (operation.table === 'contacts' || operation.table === 'templates') {
        return SyncPriority.HIGH;
    }

    // Normal priority for most operations
    if (operation.table === 'activityLogs' || operation.table === 'groups') {
        return SyncPriority.NORMAL;
    }

    // Low priority for background data
    return SyncPriority.LOW;
}

/**
 * Estimate operation size for batching optimization.
 */
export function estimateOperationSize(operation: SyncOperation): number {
    const baseSize = 100; // Base size for operation metadata
    const dataSize = JSON.stringify(operation.data || {}).length;
    return baseSize + dataSize;
}

// ─── Queue Operations ────────────────────────────────────

/**
 * Get prioritized sync operations from the queue.
 */
export async function getPrioritizedSyncOperations(): Promise<PrioritySyncOperation[]> {
    const pendingOps = await db.getPendingSyncOperations();

    // Convert to priority operations and sort by priority
    const prioritizedOps: PrioritySyncOperation[] = pendingOps.map(op => ({
        ...op,
        priority: determineOperationPriority(op),
        estimatedSize: estimateOperationSize(op),
        dependencies: []
    }));

    // Sort by priority (critical first) and then by timestamp
    return prioritizedOps.sort((a, b) => {
        if (a.priority !== b.priority) {
            const priorityOrder = {
                [SyncPriority.CRITICAL]: 0,
                [SyncPriority.HIGH]: 1,
                [SyncPriority.NORMAL]: 2,
                [SyncPriority.LOW]: 3,
                [SyncPriority.BACKGROUND]: 4
            };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return compareTimestamps(a.timestamp, b.timestamp);
    });
}

/**
 * Add an operation to the sync queue.
 *
 * @param ctx — context object providing `currentConfig`, `lastUserActivity`, `isOnline`, `triggerSync`, `compressData`
 */
export async function addToSyncQueue(
    ctx: {
        currentConfig: { compressionEnabled: boolean };
        lastUserActivity: Date;
        isOnline: boolean;
        triggerSync: () => Promise<void>;
        compressData: (data: any) => Promise<any>;
    },
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
    if (ctx.currentConfig.compressionEnabled && operation !== 'delete') {
        processedData = await ctx.compressData(validatedData);
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
    ctx.lastUserActivity = new Date();

    // Trigger immediate sync for critical operations
    if (priority === SyncPriority.CRITICAL && ctx.isOnline) {
        setTimeout(() => ctx.triggerSync(), 100);
    }
}
