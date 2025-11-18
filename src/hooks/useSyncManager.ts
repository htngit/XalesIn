import { useState, useEffect, useCallback } from 'react';
import { SyncManager, SyncStatus } from '../lib/sync/SyncManager';
import { db } from '../lib/db';

export interface SyncStats {
  status: SyncStatus;
  isOnline: boolean;
  unsyncedCounts: Record<string, number>;
  pendingOperations: number;
  totalPending: number;
}

export interface ServiceSyncStatus {
  serviceName: string;
  total: number;
  pending: number;
  synced: number;
  conflicts: number;
  status: SyncStatus;
}

export function useSyncManager(syncManager?: SyncManager) {
  const [syncStats, setSyncStats] = useState<SyncStats>({
    status: SyncStatus.IDLE,
    isOnline: navigator.onLine,
    unsyncedCounts: {},
    pendingOperations: 0,
    totalPending: 0
  });

  const [serviceStatuses, setServiceStatuses] = useState<ServiceSyncStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSyncStats = useCallback(async () => {
    try {
      const manager = syncManager || new SyncManager();
      const stats = await manager.getSyncStats();

      // Calculate service statuses from local database
      const statuses: ServiceSyncStatus[] = [];

      try {
        // Get contacts stats
        const contacts = await db.contacts
          .where('_syncStatus')
          .equals('pending')
          .count();
        const syncedContacts = await db.contacts
          .where('_syncStatus')
          .equals('synced')
          .count();
        const conflictContacts = await db.contacts
          .where('_syncStatus')
          .equals('conflict')
          .count();
        const totalContacts = await db.contacts.count();

        statuses.push({
          serviceName: 'Contacts',
          total: totalContacts,
          pending: contacts,
          synced: syncedContacts,
          conflicts: conflictContacts,
          status: contacts > 0 ? SyncStatus.SYNCING : SyncStatus.IDLE
        });
      } catch (error) {
        console.warn('Failed to get contact sync status:', error);
      }

      try {
        // Get templates stats
        const templates = await db.templates
          .where('_syncStatus')
          .equals('pending')
          .count();
        const syncedTemplates = await db.templates
          .where('_syncStatus')
          .equals('synced')
          .count();
        const conflictTemplates = await db.templates
          .where('_syncStatus')
          .equals('conflict')
          .count();
        const totalTemplates = await db.templates.count();

        statuses.push({
          serviceName: 'Templates',
          total: totalTemplates,
          pending: templates,
          synced: syncedTemplates,
          conflicts: conflictTemplates,
          status: templates > 0 ? SyncStatus.SYNCING : SyncStatus.IDLE
        });
      } catch (error) {
        console.warn('Failed to get template sync status:', error);
      }

      try {
        // Get history stats
        const history = await db.activityLogs
          .where('_syncStatus')
          .equals('pending')
          .count();
        const syncedHistory = await db.activityLogs
          .where('_syncStatus')
          .equals('synced')
          .count();
        const conflictHistory = await db.activityLogs
          .where('_syncStatus')
          .equals('conflict')
          .count();
        const totalHistory = await db.activityLogs.count();

        statuses.push({
          serviceName: 'History',
          total: totalHistory,
          pending: history,
          synced: syncedHistory,
          conflicts: conflictHistory,
          status: history > 0 ? SyncStatus.SYNCING : SyncStatus.IDLE
        });
      } catch (error) {
        console.warn('Failed to get history sync status:', error);
      }

      try {
        // Get groups stats
        const groups = await db.groups
          .where('_syncStatus')
          .equals('pending')
          .count();
        const syncedGroups = await db.groups
          .where('_syncStatus')
          .equals('synced')
          .count();
        const conflictGroups = await db.groups
          .where('_syncStatus')
          .equals('conflict')
          .count();
        const totalGroups = await db.groups.count();

        statuses.push({
          serviceName: 'Groups',
          total: totalGroups,
          pending: groups,
          synced: syncedGroups,
          conflicts: conflictGroups,
          status: groups > 0 ? SyncStatus.SYNCING : SyncStatus.IDLE
        });
      } catch (error) {
        console.warn('Failed to get group sync status:', error);
      }

      try {
        // Get assets stats
        const assets = await db.assets
          .where('_syncStatus')
          .equals('pending')
          .count();
        const syncedAssets = await db.assets
          .where('_syncStatus')
          .equals('synced')
          .count();
        const conflictAssets = await db.assets
          .where('_syncStatus')
          .equals('conflict')
          .count();
        const totalAssets = await db.assets.count();

        statuses.push({
          serviceName: 'Assets',
          total: totalAssets,
          pending: assets,
          synced: syncedAssets,
          conflicts: conflictAssets,
          status: assets > 0 ? SyncStatus.SYNCING : SyncStatus.IDLE
        });
      } catch (error) {
        console.warn('Failed to get asset sync status:', error);
      }

      setSyncStats(stats);
      setServiceStatuses(statuses);
    } catch (error) {
      console.error('Failed to refresh sync stats:', error);
    }
  }, [syncManager]);

  const forceSync = async () => {
    setIsLoading(true);
    try {
      const manager = syncManager || new SyncManager();
      await manager.triggerSync();
      await refreshSyncStats();
    } catch (error) {
      console.error('Force sync failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearLocalData = async (masterUserId: string) => {
    setIsLoading(true);
    try {
      await db.clearUserData(masterUserId);
      await refreshSyncStats();
    } catch (error) {
      console.error('Failed to clear local data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    refreshSyncStats();

    // Set up periodic refresh
    const interval = setInterval(refreshSyncStats, 30000); // Every 30 seconds

    // Set up online/offline detection
    const handleOnline = () => {
      setSyncStats(prev => ({ ...prev, isOnline: true }));
      refreshSyncStats();
    };

    const handleOffline = () => {
      setSyncStats(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshSyncStats]);

  return {
    syncStats,
    serviceStatuses,
    isLoading,
    forceSync,
    clearLocalData,
    refreshSyncStats
  };
}