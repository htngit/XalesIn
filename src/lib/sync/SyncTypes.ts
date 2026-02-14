/**
 * SyncTypes.ts — Pure type definitions for the Sync Engine.
 * 
 * Extracted from SyncManager.ts (Phase 1 refactoring).
 * Contains enums, interfaces, and type aliases.
 * No runtime logic — zero risk of race conditions.
 */

import { SyncOperation } from '../db';

// ─── Enums ───────────────────────────────────────────────

/** Sync engine status states */
export enum SyncStatus {
    IDLE = 'idle',
    SYNCING = 'syncing',
    ERROR = 'error',
    OFFLINE = 'offline',
    RECONNECTING = 'reconnecting'
}

/** Conflict resolution strategies */
export enum ConflictResolution {
    LOCAL_WINS = 'local_wins',
    REMOTE_WINS = 'remote_wins',
    LAST_WRITE_WINS = 'last_write_wins',
    MANUAL = 'manual'
}

/** Sync priority levels */
export enum SyncPriority {
    CRITICAL = 'critical',
    HIGH = 'high',
    NORMAL = 'normal',
    LOW = 'low',
    BACKGROUND = 'background'
}

// ─── Interfaces ──────────────────────────────────────────

/** Sync event payload */
export interface SyncEvent {
    type: 'sync_start' | 'sync_complete' | 'sync_error' | 'conflict_detected' | 'status_change' | 'progress_update' | 'user_notification';
    table?: string;
    recordId?: string;
    status?: SyncStatus;
    message?: string;
    error?: Error;
    timestamp: Date;
    progress?: number;
    total?: number;
    notificationType?: 'info' | 'warning' | 'error' | 'success';
    userMessage?: string;
}

/** Sync event listener callback */
export type SyncEventListener = (event: SyncEvent) => void;

/** Enhanced sync configuration */
export interface SyncConfig {
    autoSync: boolean;
    baseSyncInterval: number;
    maxRetries: number;
    conflictResolution: ConflictResolution;
    batchSize: number;
    maxQueueSize: number;
    cleanupInterval: number;
    connectionTimeout: number;
    retryBackoffMultiplier: number;
    maxBackoffDelay: number;
    activityDetectionEnabled: boolean;
    backgroundSyncEnabled: boolean;
    compressionEnabled: boolean;
}

/** Activity detection configuration */
export interface ActivityConfig {
    userActionThreshold: number;
    syncIntervalMultiplier: number;
    idleTimeout: number;
    backgroundInterval: number;
}

/** Conflict resolution result */
export interface ConflictResolutionResult {
    resolved: boolean;
    winner: 'local' | 'remote' | 'merged';
    data: any;
    userNotification?: string;
    auditLog: string;
}

/** Sync queue item with priority */
export interface PrioritySyncOperation extends SyncOperation {
    priority: SyncPriority;
    estimatedSize: number;
    dependencies?: string[];
}

/** Performance metrics */
export interface SyncMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageSyncTime: number;
    lastSyncTime: Date;
    dataTransferred: number;
    compressionRatio: number;
    connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
}

/** Connection state */
export interface ConnectionState {
    isOnline: boolean;
    quality: 'excellent' | 'good' | 'poor' | 'offline';
    lastCheck: Date;
    consecutiveFailures: number;
    averageLatency: number;
}
