/**
 * ContactSyncService.ts — Realtime subscription and sync status management.
 *
 * Extracted from ContactService.ts (Phase 4 refactoring).
 * Encapsulates:
 * - Realtime subscriptions (subscribe/unsubscribe)
 * - Forced sync
 * - Sync status retrieval
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { db } from '../db';
import { SyncManager } from '../sync/SyncManager'; // Import types if needed, SyncManager is used as value
import { ContactWithGroup } from './types';
import { standardizeForService } from '../utils/timestamp';

export class ContactSyncService {
    private realtimeChannel: RealtimeChannel | null = null;

    constructor(private syncManager: SyncManager) { }

    /**
     * Set up real-time subscription for contact updates
     */
    subscribeToContactUpdates(callback: (contact: ContactWithGroup, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
        this.unsubscribeFromContactUpdates();

        this.realtimeChannel = supabase
            .channel('contacts')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contacts'
                },
                async (payload) => {
                    const { new: newRecord, old: oldRecord, eventType } = payload;

                    if (eventType === 'DELETE') {
                        // Transform old record with standardized timestamps
                        const transformedOld = standardizeForService(oldRecord, 'contact');
                        callback(transformedOld as ContactWithGroup, 'DELETE');
                    } else {
                        // Transform new record with standardized timestamps
                        const transformedNew = standardizeForService(newRecord, 'contact');
                        callback(transformedNew as ContactWithGroup, eventType as 'INSERT' | 'UPDATE');
                    }
                }
            )
            .subscribe();
    }

    /**
     * Unsubscribe from contact updates
     */
    unsubscribeFromContactUpdates() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    /**
     * Force sync with server
     */
    async forceSync(): Promise<void> {
        await this.syncManager.triggerSync();
    }

    /**
     * Get sync status for contacts
     */
    async getSyncStatus(masterUserId: string | null) {
        if (!masterUserId) return { total: 0, pending: 0, synced: 0, conflicts: 0, syncManagerStatus: 'IDLE' };

        const localContacts = await db.contacts
            .where('master_user_id')
            .equals(masterUserId)
            .and(contact => !contact._deleted)
            .toArray();

        const pending = localContacts.filter(c => c._syncStatus === 'pending').length;
        const synced = localContacts.filter(c => c._syncStatus === 'synced').length;
        const conflicts = localContacts.filter(c => c._syncStatus === 'conflict').length;

        return {
            total: localContacts.length,
            pending,
            synced,
            conflicts,
            syncManagerStatus: this.syncManager.getStatus()
        };
    }
}
