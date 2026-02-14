/**
 * ConnectionMonitor.ts — Connection and activity monitoring functions.
 *
 * Extracted from SyncManager.ts (Phase 4 refactoring).
 * Stateless helper functions — receive context as parameter.
 */

import { supabase } from '../supabase';
import {
    SyncStatus,
    SyncConfig,
    ActivityConfig,
    SyncMetrics,
    ConnectionState,
} from './SyncTypes';

// ─── Context Interface ───────────────────────────────────

export interface ConnectionContext {
    isOnline: boolean;
    connectionState: ConnectionState;
    syncMetrics: SyncMetrics;
    lastUserActivity: Date;
    currentSyncInterval: number;
    currentConfig: SyncConfig;
    activityConfig: ActivityConfig;
    cleanupInterval: NodeJS.Timeout | null;
    setStatus: (status: SyncStatus, msg?: string) => void;
    triggerSync: () => Promise<void>;
    stopAutoSync: () => void;
    startAutoSync: () => void;
    performCleanup: () => Promise<void>;
}

// ─── Online/Offline Detection ────────────────────────────

/**
 * Setup online/offline detection with enhanced connection monitoring.
 * Returns a cleanup function that removes listeners and clears intervals.
 */
export function setupOnlineDetection(ctx: ConnectionContext): () => void {
    const updateOnlineStatus = async () => {
        const wasOnline = ctx.isOnline;
        ctx.isOnline = navigator.onLine;

        if (wasOnline !== ctx.isOnline) {
            if (ctx.isOnline) {
                ctx.setStatus(SyncStatus.IDLE, 'Back online');
                await checkConnectionQuality(ctx);
                if (ctx.currentConfig.autoSync) {
                    ctx.triggerSync();
                }
            } else {
                ctx.setStatus(SyncStatus.OFFLINE, 'Gone offline');
                ctx.connectionState.quality = 'offline';
            }
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Periodic connection quality checks
    const qualityIntervalId = setInterval(() => {
        if (ctx.isOnline) {
            checkConnectionQuality(ctx);
        }
    }, 60000); // Check every minute

    // Return cleanup function
    return () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
        clearInterval(qualityIntervalId);
    };
}

// ─── Activity Detection ──────────────────────────────────

/**
 * Setup activity detection for dynamic sync intervals.
 * Returns a cleanup function that removes listeners and clears intervals.
 */
export function setupActivityDetection(ctx: ConnectionContext): () => void {
    if (!ctx.currentConfig.activityDetectionEnabled) return () => { };

    // Track user activity with throttling
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    let lastUpdate = 0;

    const updateActivity = () => {
        const now = Date.now();
        // Throttle updates to once per second to avoid CPU spikes on scroll/typing
        if (now - lastUpdate > 1000) {
            lastUpdate = now;
            ctx.lastUserActivity = new Date();
            adjustSyncInterval(ctx);
        }
    };

    activityEvents.forEach(event => {
        document.addEventListener(event, updateActivity, { passive: true });
    });

    // Periodic activity check
    const activityIntervalId = setInterval(() => {
        adjustSyncInterval(ctx);
    }, 10000); // Check every 10 seconds

    // Return cleanup function
    return () => {
        activityEvents.forEach(event => {
            document.removeEventListener(event, updateActivity);
        });
        clearInterval(activityIntervalId);
    };
}

// ─── Cleanup Scheduler ───────────────────────────────────

/**
 * Setup automatic cleanup scheduler.
 */
export function setupCleanupScheduler(ctx: ConnectionContext): void {
    ctx.cleanupInterval = setInterval(() => {
        ctx.performCleanup();
    }, ctx.currentConfig.cleanupInterval);
}

// ─── Connection Quality ──────────────────────────────────

/**
 * Check connection quality and update metrics.
 */
export async function checkConnectionQuality(ctx: ConnectionContext): Promise<void> {
    if (!ctx.isOnline) {
        ctx.connectionState.quality = 'offline';
        return;
    }

    try {
        const startTime = Date.now();
        // Simple connection test - check if we can reach Supabase
        const { error } = await supabase.from('profiles').select('count').limit(1).single();
        if (error) throw error;

        const latency = Date.now() - startTime;

        ctx.connectionState.lastCheck = new Date();
        ctx.connectionState.averageLatency = latency;
        ctx.connectionState.consecutiveFailures = 0;

        if (latency < 500) {
            ctx.connectionState.quality = 'excellent';
        } else if (latency < 2000) {
            ctx.connectionState.quality = 'good';
        } else {
            ctx.connectionState.quality = 'poor';
        }

        ctx.syncMetrics.connectionQuality = ctx.connectionState.quality;
    } catch (error) {
        console.error('Connection check failed:', error);
        ctx.connectionState.consecutiveFailures++;
        if (ctx.connectionState.consecutiveFailures > 3) {
            ctx.connectionState.quality = 'poor';
            ctx.syncMetrics.connectionQuality = 'poor';
        }
    }
}

// ─── Sync Interval Adjustment ────────────────────────────

/**
 * Adjust sync interval based on user activity and connection quality.
 */
export function adjustSyncInterval(ctx: ConnectionContext): void {
    if (!ctx.currentConfig.activityDetectionEnabled) return;

    const now = new Date();
    const timeSinceActivity = now.getTime() - ctx.lastUserActivity.getTime();
    const isActive = timeSinceActivity < ctx.activityConfig.idleTimeout;

    let newInterval = ctx.currentConfig.baseSyncInterval;

    if (isActive) {
        // More frequent sync when user is active
        newInterval = Math.max(
            5000, // Minimum 5 seconds
            ctx.currentConfig.baseSyncInterval * ctx.activityConfig.syncIntervalMultiplier
        );
    } else if (ctx.currentConfig.backgroundSyncEnabled) {
        // Less frequent sync when idle
        newInterval = ctx.activityConfig.backgroundInterval;
    }

    // Adjust for connection quality
    if (ctx.connectionState.quality === 'poor') {
        newInterval *= 2; // Double interval for poor connections
    } else if (ctx.connectionState.quality === 'excellent') {
        newInterval *= 0.8; // Slightly faster for excellent connections
    }

    if (newInterval !== ctx.currentSyncInterval) {
        ctx.currentSyncInterval = newInterval;
        restartAutoSync(ctx);
    }
}

/**
 * Restart auto sync with new interval.
 */
export function restartAutoSync(ctx: ConnectionContext): void {
    ctx.stopAutoSync();
    ctx.startAutoSync();
}
