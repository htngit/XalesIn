import { Contact } from './types';
import { supabase } from '../supabase';
import { db, LocalContact } from '../db';
import { SyncManager } from '../sync/SyncManager';
import { userContextManager } from '../security/UserContextManager';
import { addTimestamps, addSyncMetadata } from '../utils/timestamp';
import { localToSupabase } from '../utils/timestamp';

export interface ContactImportContext {
    db: typeof db;
    user: { id: string };
    masterUserId: string;
    isOnline: boolean;
    syncManager: SyncManager;
    backgroundSyncContacts: () => Promise<void>;
}

/**
 * Create multiple contacts efficiently
 */
export async function createContacts(
    ctx: ContactImportContext,
    contactsData: Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'master_user_id' | 'created_by'>[]
): Promise<{ success: boolean; created: number; errors: string[] }> {
    try {
        // Ensure DB is open
        if (!ctx.db.isOpen()) {
            await ctx.db.open();
        }

        const hasPermission = await userContextManager.canPerformAction('create_contacts', 'contacts');
        if (!hasPermission) {
            throw new Error('Access denied: insufficient permissions to create contacts');
        }

        const timestamps = addTimestamps({}, false);
        const syncMetadata = addSyncMetadata({}, false);

        const localContacts: LocalContact[] = [];
        const syncQueueItems: any[] = [];
        const errors: string[] = [];

        console.log('Creating contacts:', {
            count: contactsData.length,
            masterUserId: ctx.masterUserId,
            user: ctx.user.id
        });

        for (const contactData of contactsData) {
            try {
                const contactId = crypto.randomUUID();
                // STRICT PHONE NORMALIZATION
                let normalizedPhone = contactData.phone.replace(/[^\d]/g, '');
                if (normalizedPhone.startsWith('0')) {
                    normalizedPhone = '62' + normalizedPhone.slice(1);
                }

                const newLocalContact: Omit<LocalContact, 'id'> = {
                    ...contactData,
                    phone: normalizedPhone,
                    master_user_id: ctx.masterUserId,
                    created_by: ctx.user.id,
                    is_blocked: contactData.is_blocked || false,
                    created_at: timestamps.created_at,
                    updated_at: timestamps.updated_at,
                    _syncStatus: syncMetadata._syncStatus,
                    _lastModified: syncMetadata._lastModified,
                    _version: syncMetadata._version,
                    _deleted: false
                };

                const localContact = { id: contactId, ...newLocalContact };
                localContacts.push(localContact);

                // Prepare sync data
                const syncData = localToSupabase(localContact);
                syncQueueItems.push({
                    table: 'contacts',
                    type: 'create',
                    id: contactId,
                    data: syncData
                });

            } catch (err) {
                errors.push(`Failed to prepare contact ${contactData.name}: ${err}`);
            }
        }

        // Batch Operations

        // Server-First Approach for Bulk
        if (ctx.isOnline) {
            try {
                const supabaseBatch = localContacts.map(c => localToSupabase(c));

                // Chunking for Supabase/Postgres limits
                const chunkSize = 100;
                for (let i = 0; i < supabaseBatch.length; i += chunkSize) {
                    const chunk = supabaseBatch.slice(i, i + chunkSize);
                    const { error } = await supabase.from('contacts').insert(chunk);
                    if (error) throw error;
                }

                // Trigger Sync
                await ctx.syncManager.triggerSync();

                return {
                    success: true,
                    created: localContacts.length,
                    errors: []
                };

            } catch (e) {
                console.error('Server-First Bulk Create Failed, falling back to Local:', e);
                // Fallback to local
            }
        }

        if (localContacts.length > 0) {
            // Bulk add to local DB
            await ctx.db.contacts.bulkAdd(localContacts);

            // Queue sync items
            for (const item of syncQueueItems) {
                ctx.syncManager.addToSyncQueue(item.table, item.type, item.id, item.data)
                    .catch(e => console.warn('Failed to queue sync item:', e));
            }

            // Trigger sync if online
            if (ctx.isOnline) {
                ctx.backgroundSyncContacts();
            }
        }

        return {
            success: errors.length === 0,
            created: localContacts.length,
            errors
        };

    } catch (error) {
        console.error('Error creating multiple contacts:', error);
        return {
            success: false,
            created: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error']
        };
    }
}

/**
 * Sync contacts from WhatsApp DIRECTLY to Server (Server-First Approach)
 * This ensures the server is the single source of truth.
 * 1. Fetches existing contact map from Server (ID, Phone)
 * 2. Maps WA contacts to Supabase schema, reusing IDs if phone matches
 * 3. Batches upserts to Supabase (per 100)
 * 4. Triggers full sync from Server to Local
 */
export async function syncWhatsAppContactsDirectlyToServer(
    ctx: { user: { id: string }, masterUserId: string, syncManager: SyncManager },
    waContacts: Array<{ phone: string; name?: string }>
): Promise<{ added: number; updated: number; errors: number }> {
    try {
        const timestamps = addTimestamps({}, false);

        // 1. Fetch minimal map of existing Server contacts (ID, Phone)
        // We need this to ensure we don't create duplicates and reuse IDs
        const { data: serverContacts, error: fetchError } = await supabase
            .from('contacts')
            .select('id, phone, name')
            .eq('master_user_id', ctx.masterUserId)
            .eq('is_blocked', false);

        if (fetchError) throw fetchError;

        const serverPhoneMap = new Map<string, { id: string, name: string }>();
        serverContacts?.forEach(c => {
            // Normalize stored phone
            const p = c.phone.replace(/[^\d]/g, '');
            serverPhoneMap.set(p, { id: c.id, name: c.name });
        });

        const batchSize = 100;
        const validContacts: any[] = [];
        let addedCount = 0;
        let updatedCount = 0;

        // 2. Prepare Payload
        for (const waContact of waContacts) {
            let normalizedPhone = waContact.phone.replace(/[^\d]/g, '');
            if (normalizedPhone.startsWith('0')) normalizedPhone = '62' + normalizedPhone.slice(1);

            const existing = serverPhoneMap.get(normalizedPhone);
            const contactName = waContact.name || existing?.name || normalizedPhone;

            const isNameChanged = existing && existing.name !== contactName && waContact.name;

            // If it's new OR name updated, we push to upsert list
            // If it's existing and name is same, we generally skip to save bandwidth, 
            // BUT for 'upsert' safety we might want to just push it if we want to update 'last_seen' or similar?
            // For now, let's only push if New or Name Changed to optimize.

            if (!existing) {
                // NEW
                validContacts.push({
                    id: crypto.randomUUID(),
                    master_user_id: ctx.masterUserId,
                    created_by: ctx.user.id,
                    name: contactName,
                    phone: normalizedPhone,
                    tags: ['WhatsApp'], // Array for Postgres
                    notes: 'Imported from WhatsApp',
                    is_blocked: false,
                    created_at: timestamps.created_at,
                    updated_at: timestamps.updated_at,
                    _lastModified: new Date().toISOString(),
                    _version: 1,
                    _deleted: false
                });
                addedCount++;
            } else if (isNameChanged) {
                // UPDATE
                validContacts.push({
                    id: existing.id,
                    master_user_id: ctx.masterUserId,
                    updated_at: timestamps.updated_at,
                    name: contactName,
                    _lastModified: new Date().toISOString()
                });
                updatedCount++;
            }
        }

        // 3. Batch Upsert to Supabase
        if (validContacts.length > 0) {
            for (let i = 0; i < validContacts.length; i += batchSize) {
                const batch = validContacts.slice(i, i + batchSize);
                // We use upsert. 
                // Note: RLS must allow this.
                const { error: upsertError } = await supabase
                    .from('contacts')
                    .upsert(batch, { onConflict: 'id' }); // Upsert by ID

                if (upsertError) {
                    console.error('Batch upsert failed:', upsertError);
                    // Continue to next batch? Or throw?
                    // Best to log and continue to try saving others
                }
            }
        }

        // 4. Trigger Full Sync (Server -> Local)
        // This ensures local DB gets the merged state correctly.
        console.log(`[ContactService] Server sync pushed. Added: ${addedCount}, Updated: ${updatedCount}. Triggering full pull...`);

        // We force a sync.
        await ctx.syncManager.triggerSync();

        return { added: addedCount, updated: updatedCount, errors: 0 };

    } catch (error) {
        console.error('Error in server-first contact sync:', error);
        return { added: 0, updated: 0, errors: 1 };
    }
}
