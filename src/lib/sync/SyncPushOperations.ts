/**
 * SyncPushOperations.ts — Push operation helper functions.
 *
 * Extracted from SyncManager.ts (Phase 4 refactoring).
 * Stateless helper functions — receive context as parameter.
 */

import { db, SyncOperation } from '../db';
import { supabase, rpcHelpers } from '../supabase';
import { nowISO } from '../utils/timestamp';
import { PrioritySyncOperation } from './SyncTypes';

// ─── Context Interface ───────────────────────────────────

export interface PushContext {
    currentConfig: { maxRetries: number; retryBackoffMultiplier: number; maxBackoffDelay: number };
    retryDelays: Map<string, number>;
    mapTableName: (table: string) => string;
}

// ─── Push Operations ─────────────────────────────────────

/**
 * Push create operation to server.
 */
export async function pushCreate(ctx: PushContext, table: string, _recordId: string, data: any): Promise<void> {
    const supabaseTable = ctx.mapTableName(table);

    // Remove sync metadata before sending to server
    const { _syncStatus, _lastModified, _version, _deleted, _compressed, _compressionKey, assets, ...serverData } = data;

    // Filter out legacy/local-only fields for assets table
    if (table === 'assets') {
        delete (serverData as any).size;
        delete (serverData as any).type;
        delete (serverData as any).url;
        delete (serverData as any).uploadDate;
    }

    // Validate critical fields for assets
    if (table === 'assets') {
        if (!serverData.master_user_id) {
            console.error('CRITICAL: master_user_id is missing for asset!', {
                recordId: _recordId,
                serverData,
                originalData: data
            });
            throw new Error('master_user_id is required for assets');
        }
        console.log('Pushing asset to Supabase:', {
            id: serverData.id,
            master_user_id: serverData.master_user_id,
            file_name: serverData.file_name
        });
    }

    // Use upsert for all tables to handle potential duplicates from race conditions or retries
    const { error } = await supabase
        .from(supabaseTable)
        .upsert(serverData, { onConflict: 'id' });

    if (error) throw error;
}

/**
 * Push update operation to server.
 */
export async function pushUpdate(ctx: PushContext, table: string, recordId: string, data: any): Promise<void> {
    // Handle special RPC actions for quotas
    if (table === 'quotas' && data.action === 'commit_quota') {
        console.log('SyncManager: Executing commit_quota RPC', data);
        const result = await rpcHelpers.commitQuotaUsage(data.reservation_id, data.success_count);
        if (!result.success) {
            throw new Error(result.error_message || 'Failed to commit quota usage via sync');
        }
        return;
    }

    const supabaseTable = ctx.mapTableName(table);

    // Remove sync metadata before sending to server
    const { _syncStatus, _lastModified, _version, _deleted, _compressed, _compressionKey, assets, ...serverData } = data;
    serverData.updated_at = nowISO();

    // Filter out legacy/local-only fields for assets table
    if (table === 'assets') {
        delete (serverData as any).size;
        delete (serverData as any).type;
        delete (serverData as any).url;
        delete (serverData as any).uploadDate;
    }

    const { error } = await supabase
        .from(supabaseTable)
        .update(serverData)
        .eq('id', recordId);

    if (error) throw error;
}

/**
 * Push delete operation to server.
 */
export async function pushDelete(ctx: PushContext, table: string, recordId: string): Promise<void> {
    const supabaseTable = ctx.mapTableName(table);

    const { error } = await supabase
        .from(supabaseTable)
        .delete()
        .eq('id', recordId);

    if (error) throw error;
}

// ─── Operation Processing ────────────────────────────────

/**
 * Process a single sync operation by dispatching to push helpers.
 */
export async function processOperation(ctx: PushContext, operation: SyncOperation): Promise<void> {
    const table = operation.table;
    const recordId = operation.recordId;

    switch (operation.operation) {
        case 'create':
            await pushCreate(ctx, table, recordId, operation.data);
            break;
        case 'update':
            await pushUpdate(ctx, table, recordId, operation.data);
            break;
        case 'delete':
            await pushDelete(ctx, table, recordId);
            break;
        default:
            throw new Error(`Unknown operation: ${operation.operation}`);
    }

    // Update local record sync status
    const localTable = db.table(table as any);
    if (operation.operation !== 'delete') {
        await localTable.update(recordId, {
            _syncStatus: 'synced'
        });
    }
}

/**
 * Process a single operation with retry logic and exponential backoff.
 */
export async function processOperationWithRetry(ctx: PushContext, operation: PrioritySyncOperation): Promise<void> {
    const operationId = `${operation.table}_${operation.recordId}_${operation.operation}`;
    let lastError: any;

    for (let attempt = 0; attempt <= ctx.currentConfig.maxRetries; attempt++) {
        try {
            await processOperation(ctx, operation);

            // Mark operation as completed
            await db.syncQueue.update(operation.id!, {
                status: 'completed',
                lastAttempt: nowISO()
            });

            // Clear retry delay on success
            ctx.retryDelays.delete(operationId);
            return;

        } catch (error) {
            lastError = error;
            console.error(`Error processing operation ${operation.id} (attempt ${attempt + 1}):`, error);

            if (attempt < ctx.currentConfig.maxRetries) {
                // Calculate delay with exponential backoff
                const delay = Math.min(
                    1000 * Math.pow(ctx.currentConfig.retryBackoffMultiplier, attempt),
                    ctx.currentConfig.maxBackoffDelay
                );

                ctx.retryDelays.set(operationId, delay);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries failed - mark as failed
    await db.syncQueue.update(operation.id!, {
        status: 'failed',
        error: lastError instanceof Error ? lastError.message : 'Unknown error',
        retryCount: ctx.currentConfig.maxRetries,
        lastAttempt: nowISO()
    });

    throw lastError;
}

/**
 * Process a batch of sync operations with enhanced retry logic.
 */
export async function processBatchWithRetry(ctx: PushContext, operations: PrioritySyncOperation[]): Promise<void> {
    const results = await Promise.allSettled(
        operations.map(operation => processOperationWithRetry(ctx, operation))
    );

    // Log batch results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
        console.warn(`Batch processing: ${successful} successful, ${failed} failed`);
    }
}
