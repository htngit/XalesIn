import { ServiceInitializationManager } from './ServiceInitializationManager';

/**
 * Defines the structure for progress updates during the synchronization process.
 */
export interface SyncProgress {
  step: string;
  progress: number;
  status: 'syncing' | 'completed' | 'error';
  error?: string;
}

export class InitialSyncOrchestrator {
  private serviceManager: ServiceInitializationManager;

  /**
   * Creates an instance of InitialSyncOrchestrator.
   * @param serviceManager The ServiceInitializationManager instance containing initialized services
   */
  constructor(serviceManager: ServiceInitializationManager) {
    this.serviceManager = serviceManager;
  }

  /**
   * Performs the initial data synchronization for a first-time user.
   * It iterates through the core services and forces a sync with the remote data source,
   * reporting progress along the way.
   *
   * @param masterUserId The ID of the user for whom to sync data (unused as services are already initialized)
   * @param onProgress An optional callback function to report sync progress.
   * @param options Configuration options
   */
  async performInitialSync(_masterUserId: string, onProgress?: (progress: SyncProgress) => void, options: { syncAssets?: boolean } = {}): Promise<void> {
    // Verify that services are initialized before proceeding
    if (!this.serviceManager.isInitialized()) {
      throw new Error('Services must be initialized before performing initial sync');
    }

    // Get the singleton SyncManager instance
    const syncManager = this.serviceManager.getSyncManager();

    // Signal that initial sync is starting - disable autoSync
    syncManager.setInitialSyncInProgress(true);

    try {

      // Define the exact Sequence of tables to sync (Priority Order)
      // 1. Templates (Critical for UI)
      // 2. Contacts (Core Data)
      // 3. Groups (Metadata)
      // 4. Assets (Metadata only)
      // 5. History (Background)
      const tablesToSync = ['templates', 'contacts', 'groups', 'assets', 'activityLogs'];

      // Phase 1: Serial Metadata Sync
      // We pull tables one by one to avoid overwhelming the network and preventing race conditions
      for (const [index, tableName] of tablesToSync.entries()) {
        try {
          onProgress?.({
            step: tableName,
            progress: (index / tablesToSync.length) * 100,
            status: 'syncing'
          });

          console.log(`InitialSync: Pulling table '${tableName}'...`);
          // Execute Serial Pull using the singleton SyncManager
          if (tableName === 'contacts') {
            // Check if we can use Fast Import (Server Wins / Blind Insert)
            const contactCount = await this.serviceManager.getContactService().getContactCount();
            const isFreshInstall = contactCount === 0;
            console.log(`InitialSync: Pulling contacts (FastMode: ${isFreshInstall})...`);

            await syncManager.pullTableFromServer(tableName, {
              backgroundProcessing: true,
              fastImport: isFreshInstall
            });
          } else {
            await syncManager.pullTableFromServer(tableName);
          }

          onProgress?.({
            step: tableName,
            progress: ((index + 1) / tablesToSync.length) * 100,
            status: 'completed'
          });
        } catch (error: any) {
          console.error(`Initial sync failed for step '${tableName}':`, error);
          onProgress?.({
            step: tableName,
            progress: ((index + 1) / tablesToSync.length) * 100,
            status: 'error',
            error: error.message || 'An unknown error occurred'
          });
          // Re-throw the error to halt the entire sync process on failure.
          throw new Error(`Sync failed during the '${tableName}' step.`);
        }
      }

      // Phase 2: Asset Content Sync (Download files)
      const shouldSyncAssets = options.syncAssets !== false; // Default to true if undefined

      if (shouldSyncAssets) {
        try {
          onProgress?.({
            step: 'asset_content',
            progress: 0,
            status: 'syncing'
          });

          const assetService = this.serviceManager.getAssetService();
          await assetService.syncAssetsFromSupabase((progress) => {
            onProgress?.({
              step: 'asset_content',
              progress: progress,
              status: 'syncing'
            });
          });

          onProgress?.({
            step: 'asset_content',
            progress: 100,
            status: 'completed'
          });
        } catch (error: any) {
          console.error('Asset content sync failed:', error);
          // We log the error but allow the process to complete as metadata is already synced
          onProgress?.({
            step: 'asset_content',
            progress: 100,
            status: 'error',
            error: error.message || 'Failed to download asset content'
          });
        }
      } else {
        console.log('Skipping asset content sync (metadata only mode)');
      }
    } finally {
      // Signal completion - re-enable autoSync
      syncManager.setInitialSyncInProgress(false);
    }
  }
}
