/**
 * SyncMetricsAndCleanup.ts — Performance metrics and queue cleanup.
 *
 * Extracted from SyncManager.ts (Phase 2 refactoring).
 * Stateless helper functions — receive SyncManager instance fields as context.
 */

import { db } from '../db';
import { fromISOString } from '../utils/timestamp';
import type { SyncMetrics, ConnectionState, SyncConfig } from './SyncTypes';
import { SyncStatus } from './SyncTypes';

// ─── Metrics ─────────────────────────────────────────────

/**
 * Update sync metrics after successful sync.
 */
export function updateSyncMetrics(
    metrics: SyncMetrics,
    syncDuration: number,
    operationsCount: number
): void {
    metrics.lastSyncTime = new Date();
    metrics.averageSyncTime =
        (metrics.averageSyncTime + syncDuration) / 2;
    metrics.totalOperations += operationsCount;
}

/**
 * Create a fresh default SyncMetrics object.
 */
export function createDefaultMetrics(connectionQuality: ConnectionState['quality']): SyncMetrics {
    return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageSyncTime: 0,
        lastSyncTime: new Date(0),
        dataTransferred: 0,
        compressionRatio: 1.0,
        connectionQuality
    };
}

/**
 * Get comprehensive sync statistics.
 */
export async function getSyncStats(ctx: {
    status: SyncStatus;
    isOnline: boolean;
    connectionState: ConnectionState;
    syncMetrics: SyncMetrics;
    syncCache: Map<string, any>;
    compressionCache: Map<string, any>;
    retryDelays: Map<string, any>;
    currentSyncInterval: number;
    lastUserActivity: Date;
    activityConfig: { idleTimeout: number };
    currentConfig: SyncConfig;
}) {
    const unsyncedCounts = await db.getUnsyncedCount();
    const pendingOps = await db.getPendingSyncOperations();

    return {
        status: ctx.status,
        isOnline: ctx.isOnline,
        connectionQuality: ctx.connectionState.quality,
        unsyncedCounts,
        pendingOperations: pendingOps.length,
        totalPending: pendingOps.reduce((sum, _) => sum + 1, 0),
        metrics: {
            ...ctx.syncMetrics,
            cacheSize: ctx.syncCache.size,
            compressionCacheSize: ctx.compressionCache.size,
            activeRetries: ctx.retryDelays.size,
            currentSyncInterval: ctx.currentSyncInterval
        },
        activity: {
            lastUserActivity: ctx.lastUserActivity,
            isActive: (Date.now() - ctx.lastUserActivity.getTime()) < ctx.activityConfig.idleTimeout
        },
        queueHealth: {
            size: await db.syncQueue.count(),
            maxSize: ctx.currentConfig.maxQueueSize,
            healthPercentage: Math.min(100, (await db.syncQueue.where('status').equals('failed').count() / Math.max(1, await db.syncQueue.count())) * 100)
        }
    };
}

// ─── Compression ─────────────────────────────────────────

/**
 * Compress data for efficient sync (simple base64 encoding).
 */
export async function compressData(
    data: any,
    compressionCache: Map<string, string>,
    syncMetrics: SyncMetrics
): Promise<any> {
    try {
        const jsonString = JSON.stringify(data);
        // Simple compression - in production, use a proper compression library
        const compressed = btoa(jsonString); // Base64 encoding as simple compression
        const compressionKey = `compressed_${Date.now()}_${Math.random()}`;

        compressionCache.set(compressionKey, compressed);
        syncMetrics.compressionRatio = (syncMetrics.compressionRatio + (jsonString.length / compressed.length)) / 2;

        return { _compressed: true, _compressionKey: compressionKey };
    } catch (error) {
        console.warn('Compression failed, using original data:', error);
        return data;
    }
}

// ─── Cleanup ─────────────────────────────────────────────

/**
 * Perform automatic cleanup of sync queue and cache.
 */
export async function performCleanup(
    syncCache: Map<string, any>,
    compressionCache: Map<string, any>
): Promise<void> {
    try {
        // Clean up old failed operations
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        await db.syncQueue
            .where('status').equals('failed')
            .and(item => fromISOString(item.timestamp) < cutoffDate)
            .delete();

        // Clean up old completed operations (keep last 1000)
        const completedOps = await db.syncQueue
            .where('status').equals('completed')
            .reverse()
            .sortBy('timestamp');

        if (completedOps.length > 1000) {
            const toDelete = completedOps.slice(1000);
            await db.syncQueue.bulkDelete(toDelete.map(op => op.id!));
        }

        // Clean up sync cache (remove items older than 1 hour)
        const cacheCutoff = Date.now() - 60 * 60 * 1000;
        for (const key of syncCache.keys()) {
            const value = syncCache.get(key);
            if (value && value.timestamp && value.timestamp < cacheCutoff) {
                syncCache.delete(key);
            }
        }

        // Clean up compression cache
        for (const [key, _value] of compressionCache.entries()) {
            // Keep compressed data for 30 minutes
            if (Date.now() - parseInt(key.split('_')[1] || '0') > 30 * 60 * 1000) {
                compressionCache.delete(key);
            }
        }

        console.log('Sync cleanup completed');
    } catch (error) {
        console.error('Error during sync cleanup:', error);
    }
}
