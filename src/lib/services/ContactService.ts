import { Contact, ContactWithGroup, LeadStatus } from './types';
import { supabase, handleDatabaseError } from '../supabase';
import { db, LocalContact } from '../db';
import { SyncManager } from '../sync/SyncManager';
import { userContextManager } from '../security/UserContextManager';
import {
  toISOString,
  localToSupabase,
  addSyncMetadata,
  addTimestamps,
  standardizeForService
} from '../utils/timestamp';
import {
  validateContact,
  isValidUUID,
  logValidationError,
  sanitizeString,
  sanitizeBoolean,
  isValidPhoneNumber,
  sanitizeArray
} from '../utils/validation';

import {
  searchLocalContacts,
  getLocalContactsByGroupId,
  getLocalContactsByGroupIds,
  getLocalContactsByLeadStatus,
  getContactCount as _getContactCount,
} from './ContactQueryService';
import {
  getCRMStats as _getCRMStats,
  getSalesFunnel as _getSalesFunnel,
  getRecentActivityContacts as _getRecentActivityContacts,
} from './ContactCRMService';
import { createContacts, syncWhatsAppContactsDirectlyToServer } from './ContactImportService';
import { ContactSyncService } from './ContactSyncService';

export class ContactService {
  private contactSyncService: ContactSyncService;
  private syncManager: SyncManager;
  private syncListener: any = null;
  private masterUserId: string | null = null;

  constructor(syncManager?: SyncManager) {
    this.syncManager = syncManager || new SyncManager();
    this.contactSyncService = new ContactSyncService(this.syncManager);
    this.setupSyncEventListeners();
  }

  /**
   * Setup event listeners for sync events
   */
  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.syncListener) {
      this.syncManager.removeEventListener(this.syncListener);
      this.syncListener = null;
    }
  }

  /**
   * Setup event listeners for sync events
   */
  private setupSyncEventListeners() {
    this.syncListener = (event: any) => {
      if (event.table === 'contacts') {
        switch (event.type) {
          case 'sync_complete':
            // Refresh local contacts after sync
            this.refreshFromSync();
            break;
          case 'sync_error':
            console.error('Contact sync error:', event.error);
            break;
        }
      }
    };
    this.syncManager.addEventListener(this.syncListener);
  }

  /**
   * Set the current master user ID and configure sync
   */
  async initialize(masterUserId: string) {
    this.masterUserId = masterUserId;
    this.syncManager.setMasterUserId(masterUserId);

    // Start auto sync
    this.syncManager.startAutoSync();
  }

  /**
   * Check if initial sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.syncManager.isInitialSyncInProgress();
  }





  /**
   * Background sync contacts without blocking the main operation
   */
  private async backgroundSyncContacts(): Promise<void> {
    try {
      // Don't await this to avoid blocking the main operation
      // this.syncManager.triggerSync().catch(...) -> Removed to prevent blocking initialization
      // Initial sync is now handled by InitialSyncOrchestrator
    } catch (error) {
      console.warn('Failed to trigger background sync:', error);
    }
  }

  /**
   * Get the current authenticated user
   */
  private async getCurrentUser() {
    const user = await userContextManager.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    return user;
  }

  /**
   * Get master user ID (for multi-tenant support)
   * @param options.strict If true, throws error if profile fetch fails instead of falling back to user.id
   */
  private async getMasterUserId(options: { strict?: boolean } = {}): Promise<string> {
    if (this.masterUserId) {
      return this.masterUserId;
    }

    const user = await this.getCurrentUser();

    try {
      // 1. Try to get from local database first (Offline-first)
      const localProfile = await db.profiles.get(user.id);
      if (localProfile && localProfile.master_user_id) {
        this.masterUserId = localProfile.master_user_id;
        return this.masterUserId;
      }

      // 2. If not found locally, try Supabase
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('master_user_id')
        .eq('id', user.id)
        .single();

      if (error) {
        // Only log warning, as this is expected in offline mode if profile not synced yet
        console.warn('Could not fetch user profile from Supabase:', error);

        if (options.strict) {
          throw new Error(`Failed to resolve master user ID: ${error.message}`);
        }

        // Final fallback
        return user.id;
      }

      if (profile) {
        this.masterUserId = profile.master_user_id;
        return this.masterUserId!;
      }
    } catch (err) {
      console.error('Error resolving master_user_id:', err);
      if (options.strict) {
        throw err;
      }
    }

    this.masterUserId = user.id;
    return this.masterUserId!;
  }

  /**
   * Refresh local contacts from sync results
   */
  private async refreshFromSync() {
    // This will be called when sync completes
    // No action needed as the sync manager handles local updates
  }

  /**
   * Transform local contacts to match interface using standardized timestamps with comprehensive type validation
   */
  private transformLocalContacts(localContacts: LocalContact[]): ContactWithGroup[] {
    return localContacts.map(contact => {
      try {
        // Validate the contact data first
        const validatedContact = validateContact(contact);
        if (!validatedContact) {
          console.error('Invalid contact data during transformation:', contact);
          // Return a minimal valid contact to prevent system failure
          return {
            id: contact.id || crypto.randomUUID(),
            name: 'Invalid Contact',
            phone: '',
            group_id: contact.group_id || undefined,
            master_user_id: contact.master_user_id || '',
            created_by: contact.created_by || '',
            tags: [],
            notes: '',
            is_blocked: false,
            created_at: toISOString(new Date()),
            updated_at: toISOString(new Date())
          } as ContactWithGroup;
        }

        // Apply standardized timestamp transformation
        const standardized = standardizeForService(validatedContact, 'contact');

        // Ensure all required fields are properly typed
        const transformed: ContactWithGroup = {
          ...standardized,
          name: sanitizeString(standardized.name, 'name', 255),
          phone: sanitizeString(standardized.phone, 'phone', 50), // Increased to 50 to accommodate WhatsApp JIDs
          tags: sanitizeArray(standardized.tags, 'tags', (tag): tag is string => typeof tag === 'string'),
          notes: sanitizeString(standardized.notes, 'notes', 1000),
          is_blocked: sanitizeBoolean(standardized.is_blocked, 'is_blocked'),
          // CRM Fields - Pass through if present, otherwise set defaults or undefined
          lead_status: standardized.lead_status || 'new',
          lead_source: standardized.lead_source || 'whatsapp',
          lead_score: standardized.lead_score || 0,
          assigned_to: standardized.assigned_to,
          company: sanitizeString(standardized.company, 'company', 255),
          job_title: sanitizeString(standardized.job_title, 'job_title', 255),
          email: sanitizeString(standardized.email, 'email', 255),
          address: sanitizeString(standardized.address, 'address', 1000),
          city: sanitizeString(standardized.city, 'city', 255),
          deal_value: standardized.deal_value || 0,
          last_contacted_at: standardized.last_contacted_at,
          next_follow_up: standardized.next_follow_up,
          lost_reason: sanitizeString(standardized.lost_reason, 'lost_reason', 1000),
          groups: undefined // Will be enriched separately
        };

        // Validate critical fields
        if (!isValidUUID(transformed.id)) {
          console.warn('Invalid contact ID, generating new UUID:', transformed.id);
          transformed.id = crypto.randomUUID();
        }

        if (!isValidUUID(transformed.master_user_id)) {
          console.warn('Invalid contact master_user_id:', transformed.master_user_id);
        }

        if (!transformed.phone || !isValidPhoneNumber(transformed.phone)) {
          console.warn('Invalid contact phone number:', transformed.phone);
        }

        return transformed;
      } catch (error) {
        logValidationError('transform', 'contact', contact, error);
        // Return a safe fallback contact
        return {
          id: contact.id || crypto.randomUUID(),
          name: 'Error Contact',
          phone: '',
          group_id: contact.group_id || '',
          master_user_id: contact.master_user_id || '',
          created_by: contact.created_by || '',
          tags: [],
          notes: '',
          is_blocked: false,
          lead_status: 'new',
          created_at: toISOString(new Date()),
          updated_at: toISOString(new Date())
        } as ContactWithGroup;
      }
    });
  }

  /**
   * Get all contacts for the current user's master account
   * Prioritizes local data, falls back to server if needed
   * Enforces data isolation using UserContextManager
   * Enhanced with offline-first approach and better error handling
   */
  async getContacts(): Promise<ContactWithGroup[]> {
    try {
      // Ensure DB is open (handle potential closure from HMR or other services)
      if (!db.isOpen()) {
        await db.open();
      }

      // RLS policies handle data isolation at the database level
      const masterUserId = await this.getMasterUserId();

      // Check online status and prioritize accordingly
      const isOnline = this.syncManager.getIsOnline();

      // First, try to get from local database
      console.log('Fetching contacts for masterUserId:', masterUserId);
      let localContacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted)
        .toArray();

      // Sort by updated_at descending to ensure recently moved contacts are visible (within 20-item limit)
      localContacts.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      console.log('Local contacts found:', localContacts.length);

      // If we have local data, return it immediately (offline-first approach)
      if (localContacts.length > 0) {
        // Enrich with group data
        const enrichedContacts = await this.enrichContactsWithGroups(localContacts);

        // If online, trigger background sync to update local data
        // If online, trigger background sync to update local data
        // Only trigger if we haven't synced in the last minute (to prevent spamming on navigation)
        // If online, trigger background sync to update local data
        // REMOVED: Side-effect sync here caused infinite loops with Dashboard refresh.
        // Sync is now handled exclusively by SyncManager auto-sync or manual user action.
        /*
        if (isOnline) {
          const lastSync = this.syncManager.getGlobalLastSyncTime();
          const timeSinceSync = Date.now() - lastSync.getTime();

          // Sync if never synced (time is 0) or > 60 seconds ago
          if (lastSync.getTime() === 0 || timeSinceSync > 60000) {
            console.log('ContactService: Triggering background sync (Debounced)');
            // We use triggerSync directly from syncManager to ensure correct timer handling
            this.syncManager.triggerSync().catch(err => {
              console.warn('Background sync failed:', err);
            });
          }
        }
        */

        return enrichedContacts;
      }

      // No local data available
      if (isOnline) {
        // NOTE: We do NOT trigger full sync here anymore to prevent intrusive UI toast.
        // We fallback to direct server fetch (read-only) and let autoSync handle the local DB population in background.
        /*
        try {
          // Try to sync from server
          await this.syncManager.triggerSync();
      
          // Try local again after sync
          localContacts = await db.contacts
            .where('master_user_id')
            .equals(masterUserId)
            .and(contact => !contact._deleted)
            .toArray();
      
          if (localContacts.length > 0) {
            return await this.enrichContactsWithGroups(localContacts);
          }
        } catch (syncError) {
          console.warn('Sync failed, trying direct server fetch:', syncError);
        }
        */

        // Fallback to direct server fetch
        return await this.fetchContactsFromServer();
      } else {
        // Offline mode: return empty array or cached data
        console.log('Operating in offline mode - no contacts available locally');
        return [];
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);

      // Enhanced error handling with offline fallback
      const isOnline = this.syncManager.getIsOnline();
      if (!isOnline) {
        // In offline mode, try to return whatever local data we have
        try {
          const masterUserId = await this.getMasterUserId();
          const localContacts = await db.contacts
            .where('master_user_id')
            .equals(masterUserId)
            .and(contact => !contact._deleted)
            .toArray();

          if (localContacts.length > 0) {
            return await this.enrichContactsWithGroups(localContacts);
          }
        } catch (offlineError) {
          console.error('Even offline fallback failed:', offlineError);
        }

        return [];
      }

      // Online mode fallback to server
      try {
        return await this.fetchContactsFromServer();
      } catch (serverError) {
        console.error('Server fetch also failed:', serverError);
        throw new Error(`Failed to fetch contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Enrich contacts with group information
   */
  private async enrichContactsWithGroups(contacts: LocalContact[]): Promise<ContactWithGroup[]> {
    const groupIds = [...new Set(contacts.map(c => c.group_id).filter((id): id is string => !!id))];

    if (groupIds.length === 0) {
      return this.transformLocalContacts(contacts);
    }

    const localGroups = await db.groups
      .where('id')
      .anyOf(groupIds)
      .toArray();

    const groupMap = new Map(localGroups.map(g => [g.id, g]));

    return contacts.map(contact => ({
      ...this.transformLocalContacts([contact])[0],
      groups: contact.group_id ? groupMap.get(contact.group_id) : undefined
    }));
  }

  /**
   * Fetch contacts directly from server
   * Uses RPC to bypass the 1000 row limit of standard Supabase queries
   */
  private async fetchContactsFromServer(): Promise<ContactWithGroup[]> {
    await this.getCurrentUser(); // Ensure user is authenticated
    const masterUserId = await this.getMasterUserId();

    // Use RPC to fetch ALL contacts (bypass 1000 row limit)
    const { data, error } = await supabase.rpc('sync_pull_contacts', {
      p_master_user_id: masterUserId,
      p_last_sync: '1970-01-01' // Fetch all contacts
    });

    if (error) {
      console.error('RPC sync_pull_contacts failed:', error);
      throw error;
    }

    const contacts = (data || []) as LocalContact[];
    console.log(`Fetched ${contacts.length} contacts from server via RPC`);

    // Transform server data to match interface with standardized timestamps
    const transformed = contacts.map(contact => {
      const standardized = standardizeForService(contact, 'contact');
      return {
        ...standardized,
        // Note: RPC doesn't include group data, we'll enrich later if needed
        groups: null
      };
    }) as ContactWithGroup[];

    // Sort by updated_at descending
    return transformed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  /**
   * Get contacts filtered by group ID
   * @delegate ContactQueryService.getLocalContactsByGroupId
   */
  async getContactsByGroupId(groupId: string): Promise<ContactWithGroup[]> {
    try {
      const masterUserId = await this.getMasterUserId();
      const localContacts = await getLocalContactsByGroupId(masterUserId, groupId);

      if (localContacts.length > 0) {
        return await this.enrichContactsWithGroups(localContacts);
      }

      // Fallback to server
      const serverContacts = await this.fetchContactsFromServer();
      return serverContacts.filter(contact => contact.group_id === groupId);
    } catch (error) {
      console.error('Error fetching contacts by group:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Get contacts filtered by multiple group IDs
   * @delegate ContactQueryService.getLocalContactsByGroupIds
   */
  async getContactsByGroupIds(groupIds: string[]): Promise<ContactWithGroup[]> {
    try {
      const masterUserId = await this.getMasterUserId();
      const localContacts = await getLocalContactsByGroupIds(masterUserId, groupIds);

      if (localContacts.length > 0) {
        return await this.enrichContactsWithGroups(localContacts);
      }

      // Fallback to server
      const serverContacts = await this.fetchContactsFromServer();
      return serverContacts.filter(contact => !!contact.group_id && groupIds.includes(contact.group_id));
    } catch (error) {
      console.error('Error fetching contacts by groups:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Alias for getContacts (for backward compatibility)
   */
  async getAllContacts(): Promise<Contact[]> {
    const contacts = await this.getContacts();
    return contacts;
  }

  /**
   * Get the count of contacts for the current user
   * @delegate ContactQueryService.getContactCount
   */
  async getContactCount(): Promise<number> {
    try {
      const masterUserId = await this.getMasterUserId();
      return await _getContactCount(masterUserId);
    } catch (error) {
      console.warn('Error counting contacts:', error);
      return 0;
    }
  }

  /**
   * Search contacts by name, phone, or tags
   * @delegate ContactQueryService.searchLocalContacts
   */
  async searchContacts(query: string): Promise<ContactWithGroup[]> {
    try {
      const masterUserId = await this.getMasterUserId();
      const filteredLocal = await searchLocalContacts(masterUserId, query);

      if (filteredLocal.length > 0) {
        return await this.enrichContactsWithGroups(filteredLocal);
      }

      // Fallback to server search
      const serverContacts = await this.fetchContactsFromServer();
      const lowerQuery = query.toLowerCase();
      return serverContacts.filter(contact =>
        contact.name.toLowerCase().includes(lowerQuery) ||
        contact.phone.includes(query) ||
        contact.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      console.error('Error searching contacts:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Get a single contact by ID
   */
  async getContactById(id: string): Promise<ContactWithGroup | null> {
    try {
      const masterUserId = await this.getMasterUserId();

      // Try local first
      const localContact = await db.contacts.get(id);

      if (localContact && !localContact._deleted && localContact.master_user_id === masterUserId) {
        const enriched = await this.enrichContactsWithGroups([localContact]);
        return enriched[0] || null;
      }

      // Fallback to server
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          groups (
            id,
            name,
            color
          )
        `)
        .eq('id', id)
        .eq('master_user_id', masterUserId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        throw error;
      }

      // Transform with standardized timestamps
      const standardized = standardizeForService(data, 'contact');
      return {
        ...standardized,
        groups: data.groups
      } as ContactWithGroup;
    } catch (error) {
      console.error('Error fetching contact by ID:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Create a new contact - local first with sync
   * Enhanced with offline/online handling and better error recovery
   * Enforces data isolation using UserContextManager
   */
  async createContact(contactData: Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'master_user_id' | 'created_by'>): Promise<ContactWithGroup> {
    try {
      // Ensure DB is open
      if (!db.isOpen()) {
        await db.open();
      }

      // Enforce data isolation - check user context and permissions
      const hasPermission = await userContextManager.canPerformAction('create_contacts', 'contacts');
      if (!hasPermission) {
        throw new Error('Access denied: insufficient permissions to create contacts');
      }

      const user = await this.getCurrentUser();
      const masterUserId = await this.getMasterUserId();
      const isOnline = this.syncManager.getIsOnline();

      // Use standardized timestamp utilities
      const timestamps = addTimestamps({}, false);
      const syncMetadata = addSyncMetadata({}, false);

      // Prepare local contact data with required timestamps
      // STRICT PHONE NORMALIZATION
      let normalizedPhone = contactData.phone.replace(/[^\d]/g, '');
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '62' + normalizedPhone.slice(1);
      }

      const newLocalContact: Omit<LocalContact, 'id'> = {
        ...contactData,
        phone: normalizedPhone,
        master_user_id: masterUserId,
        created_by: user.id,
        is_blocked: contactData.is_blocked || false,
        created_at: timestamps.created_at,
        updated_at: timestamps.updated_at,
        _syncStatus: syncMetadata._syncStatus,
        _lastModified: syncMetadata._lastModified,
        _version: syncMetadata._version,
        _deleted: false
      };

      // Add to local database first (always works in offline mode)
      const contactId = crypto.randomUUID();
      const localContact = {
        id: contactId,
        ...newLocalContact
      };

      // Server-First Approach if Online
      // Server-First Approach if Online
      if (isOnline) {
        try {
          // Prepare Supabase payload
          const rawSyncData = localToSupabase(localContact);

          // Convert undefined to null (defensive coding for Supabase INSERT)
          const syncData: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rawSyncData)) {
            syncData[key] = value === undefined ? null : value;
          }

          const { error } = await supabase
            .from('contacts')
            .insert(syncData);

          if (error) throw error;

          // Trigger full sync to update local DB (and ensuring consistency)
          await this.syncManager.triggerSync();

          // Return the contact from local DB (which should be updated by sync)
          const syncedContact = await this.getContactById(contactId);
          if (syncedContact) return syncedContact;

          // If sync was slow and didn't bring it back yet, 
          // we manually add it LOCALLY as 'synced' so we don't queue it again.
          const manualSyncedContact = { ...localContact, _syncStatus: 'synced' as const };
          await db.contacts.add(manualSyncedContact);

          // Return enriched
          const enriched = await this.enrichContactsWithGroups([manualSyncedContact]);
          return enriched[0];

        } catch (serverError) {
          console.error('Server-First Create Failed, falling back to Local:', serverError);
          // Fallback to local logic below...
        }
      }

      await db.contacts.add(localContact);

      // Transform for sync queue (convert Date objects to ISO strings)
      const syncData = localToSupabase(localContact);

      // Try to sync immediately if online (and server-first failed or skipped), otherwise queue for later
      if (isOnline) {
        // ... existing queue logic ...
        try {
          await this.syncManager.addToSyncQueue('contacts', 'create', contactId, syncData);
        } catch (syncError) {
          console.warn('Immediate sync failed, will retry later:', syncError);
          this.syncManager.addToSyncQueue('contacts', 'create', contactId, syncData).catch(console.error);
        }
      } else {
        // Offline mode: queue for later sync
        await this.syncManager.addToSyncQueue('contacts', 'create', contactId, syncData);
      }

      // Enrich with group data for return
      const enriched = await this.enrichContactsWithGroups([localContact]);
      return enriched[0];
    } catch (error) {
      console.error('Error creating contact:', error);

      // Enhanced error handling
      if (error instanceof Error) {
        throw new Error(`Failed to create contact: ${error.message}`);
      }
      throw new Error('Failed to create contact: Unknown error');
    }
  }

  /**
   * Create multiple contacts efficiently
   */
  async createContacts(contactsData: Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'master_user_id' | 'created_by'>[]): Promise<{ success: boolean; created: number; errors: string[] }> {
    return createContacts({
      db,
      user: await this.getCurrentUser(),
      masterUserId: await this.getMasterUserId({ strict: true }),
      isOnline: this.syncManager.getIsOnline(),
      syncManager: this.syncManager,
      backgroundSyncContacts: this.backgroundSyncContacts.bind(this)
    }, contactsData);
  }

  /**
   * Sync contacts from WhatsApp DIRECTLY to Server (Server-First Approach)
   * This ensures the server is the single source of truth.
   * 1. Fetches existing contact map from Server (ID, Phone)
   * 2. Maps WA contacts to Supabase schema, reusing IDs if phone matches
   * 3. Batches upserts to Supabase (per 100)
   * 4. Triggers full sync from Server to Local
   */
  async syncWhatsAppContactsDirectlyToServer(waContacts: Array<{ phone: string; name?: string }>): Promise<{ added: number; updated: number; errors: number }> {
    return syncWhatsAppContactsDirectlyToServer({
      user: await this.getCurrentUser(),
      masterUserId: await this.getMasterUserId(),
      syncManager: this.syncManager
    }, waContacts);
  }

  /**
   * Sync contacts from WhatsApp (Upsert operation)
   * Prevents duplicates by checking existing phone numbers.
   */
  async upsertContactsFromWhatsApp(waContacts: Array<{ phone: string; name?: string }>): Promise<{ added: number; updated: number; errors: number }> {
    try {
      const masterUserId = await this.getMasterUserId();
      const user = await this.getCurrentUser();
      const timestamps = addTimestamps({}, false);

      // 1. Get all local contacts for quick lookup
      const existingContacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(c => !c._deleted)
        .toArray();

      const phoneMap = new Map<string, LocalContact>();
      existingContacts.forEach(c => {
        // Normalize stored phone for map key
        const p = c.phone.replace(/[^\d]/g, '');
        phoneMap.set(p, c);
      });

      const toAdd: LocalContact[] = [];
      const toUpdate: LocalContact[] = [];
      const syncQueueItems: any[] = [];

      let addedCount = 0;
      let updatedCount = 0;

      for (const waContact of waContacts) {
        // Normalize incoming phone
        let normalizedPhone = waContact.phone.replace(/[^\d]/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '62' + normalizedPhone.slice(1);

        const existing = phoneMap.get(normalizedPhone);
        const contactName = waContact.name || existing?.name || normalizedPhone; // Prioritize WA name -> Existing name -> Phone

        if (existing) {
          // Update only if name changed (or other logic) OR if group_id is invalid (empty string)
          const isNameChanged = existing.name !== contactName && waContact.name;
          const hasInvalidGroupId = existing.group_id === '';

          if (isNameChanged || hasInvalidGroupId) {
            const updated = {
              ...existing,
              name: contactName,
              group_id: existing.group_id || undefined, // Ensure empty string becomes undefined
              // Add 'WhatsApp' tag if not present
              tags: existing.tags ? (existing.tags.includes('WhatsApp') ? existing.tags : [...existing.tags, 'WhatsApp']) : ['WhatsApp'],
              updated_at: timestamps.updated_at,
              _syncStatus: 'pending' as const, // Force sync
              _lastModified: new Date().toISOString()
            };
            toUpdate.push(updated);

            // Queue Sync
            syncQueueItems.push({
              table: 'contacts',
              type: 'update',
              id: existing.id,
              data: localToSupabase(updated)
            });
            updatedCount++;
          }
        } else {
          // Insert New
          const contactId = crypto.randomUUID();
          const newContact: LocalContact = {
            id: contactId,
            master_user_id: masterUserId,
            created_by: user.id,
            name: contactName,
            phone: normalizedPhone,
            group_id: undefined, // No group initially
            tags: ['WhatsApp'],
            notes: 'Imported from WhatsApp',
            is_blocked: false,
            created_at: timestamps.created_at,
            updated_at: timestamps.updated_at,
            _syncStatus: 'pending',
            _lastModified: new Date().toISOString(),
            _version: 1,
            _deleted: false
          };
          toAdd.push(newContact);

          // Queue Sync
          syncQueueItems.push({
            table: 'contacts',
            type: 'create',
            id: contactId,
            data: localToSupabase(newContact)
          });
          addedCount++;
        }
      }

      // Batch Operations
      if (toAdd.length > 0) {
        await db.contacts.bulkAdd(toAdd);
      }
      if (toUpdate.length > 0) {
        await db.contacts.bulkPut(toUpdate);
      }

      // Queue Sync Items
      for (const item of syncQueueItems) {
        this.syncManager.addToSyncQueue(item.table, item.type, item.id, item.data).catch(console.warn);
      }

      return { added: addedCount, updated: updatedCount, errors: 0 };

    } catch (error) {
      console.error('Error syncing WA contacts:', error);
      return { added: 0, updated: 0, errors: 1 };
    }
  }

  /**
   * Update an existing contact - local first with sync
   * Enforces data isolation using UserContextManager
   */
  async updateContact(id: string, contactData: Partial<Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'master_user_id' | 'created_by'>>): Promise<ContactWithGroup | null> {
    try {
      // Enforce data isolation - check user context and permissions
      const hasPermission = await userContextManager.canPerformAction('update_contacts', 'contacts');
      if (!hasPermission) {
        throw new Error('Access denied: insufficient permissions to update contacts');
      }

      await this.getCurrentUser();
      await this.getMasterUserId();

      // Check if contact exists locally
      let existingContact = await db.contacts.get(id);

      if (!existingContact || existingContact._deleted) {
        // Contact doesn't exist locally, try server and cache locally
        const serverContact = await this.getContactById(id);
        if (!serverContact) {
          throw new Error('Contact not found');
        }
        // Use server contact data for the update base
        existingContact = {
          id: serverContact.id,
          master_user_id: serverContact.master_user_id,
          created_by: serverContact.created_by,
          name: serverContact.name,
          phone: serverContact.phone,
          group_id: serverContact.group_id,
          tags: serverContact.tags,
          notes: serverContact.notes,
          is_blocked: serverContact.is_blocked || false,
          created_at: serverContact.created_at,
          updated_at: serverContact.updated_at,
          _syncStatus: 'synced',
          _lastModified: new Date().toISOString(),
          _version: (serverContact as unknown as { _version?: number })._version || 1,
          _deleted: false
        } as LocalContact;
      }

      // Use standardized timestamp utilities for updates
      const timestamps = addTimestamps({}, true);
      const syncMetadata = addSyncMetadata(existingContact, true);

      // Prepare update data
      const updateData = {
        ...contactData,
        updated_at: timestamps.updated_at,
        _syncStatus: syncMetadata._syncStatus,
        _lastModified: syncMetadata._lastModified,
        _version: syncMetadata._version
      };

      const isOnline = this.syncManager.getIsOnline();

      // Server-First Update with verification
      if (isOnline) {
        try {
          // Prepare payload for Supabase (sanitize local metadata)
          // Removing _lastModified, _version, and _syncStatus as they don't exist on server schema
          const { _lastModified, _version, _syncStatus, ...rawPayload } = {
            ...contactData,
            updated_at: timestamps.updated_at
          } as any;

          // Convert undefined to null for Supabase (undefined is ignored in UPDATE)
          const serverPayload: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rawPayload)) {
            serverPayload[key] = value === undefined ? null : value;
          }

          // Try update first
          const { data: updateResult, error: updateError } = await supabase
            .from('contacts')
            .update(serverPayload)
            .eq('id', id)
            .select('id')
            .maybeSingle();

          // If update affected 0 rows (contact not on server yet), use upsert
          if (!updateResult && !updateError) {
            console.warn(`Contact ${id} not found on server, attempting upsert...`);

            // Get full local contact for upsert
            const fullContact = await db.contacts.get(id);
            if (fullContact) {
              const { _lastModified: l, _version: v, _syncStatus: s, _deleted: d, ...baseContact } = fullContact as any;

              const upsertData = {
                ...baseContact,
                ...serverPayload,
                id: fullContact.id,
                master_user_id: fullContact.master_user_id,
                created_by: fullContact.created_by,
                updated_at: timestamps.updated_at
              };

              const { error: upsertError } = await supabase
                .from('contacts')
                .upsert(upsertData, { onConflict: 'id' });

              if (upsertError) {
                console.error('Upsert failed:', upsertError);
                throw upsertError;
              }
              console.log(`Contact ${id} upserted to server successfully`);
            }
          } else if (updateError) {
            throw updateError;
          } else {
            console.log(`Contact ${id} updated on server successfully`);
          }

          // Update local DB to mark as synced
          if (existingContact) {
            const localUpdate = {
              ...existingContact,
              ...serverPayload,
              _lastModified: syncMetadata._lastModified,
              _version: syncMetadata._version,
              _syncStatus: 'synced' as const,
              _deleted: existingContact._deleted
            };
            await db.contacts.update(id, localUpdate);
            const enriched = await this.enrichContactsWithGroups([localUpdate]);
            return enriched[0] || null;
          }

        } catch (e) {
          console.error('Server-First Update Failed, falling back to sync queue:', e);
          // Fall through to local update with sync queue
        }
      }

      // Update local database
      await db.contacts.update(id, updateData);

      // Get updated record for sync
      const updatedContact = await db.contacts.get(id);
      if (updatedContact) {
        // Transform for sync queue (convert Date objects to ISO strings)
        const syncData = localToSupabase(updatedContact);
        await this.syncManager.addToSyncQueue('contacts', 'update', id, syncData);

        // Enrich and return
        const enriched = await this.enrichContactsWithGroups([updatedContact]);
        return enriched[0] || null;
      }

      return null;
    } catch (error) {
      console.error('Error updating contact:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Delete a contact - soft delete locally with sync
   * Enforces data isolation using UserContextManager
   */
  async deleteContact(id: string): Promise<boolean> {
    try {
      // Enforce data isolation - check user context and permissions
      const hasPermission = await userContextManager.canPerformAction('delete_contacts', 'contacts');
      if (!hasPermission) {
        throw new Error('Access denied: insufficient permissions to delete contacts');
      }

      await this.getMasterUserId();

      const isOnline = this.syncManager.getIsOnline();

      // Server-First Approach
      // Server-First Approach
      if (isOnline) {
        try {
          const timestamps = addTimestamps({}, true);

          // Soft Delete on Server
          const { error } = await supabase
            .from('contacts')
            .update({
              _deleted: true,
              updated_at: timestamps.updated_at
            })
            .eq('id', id)
            .eq('master_user_id', await this.getMasterUserId());

          if (error) throw error;

          // Trigger Sync
          await this.syncManager.triggerSync();

          // Force local update to ensure UI reflects it immediately if sync lags
          await db.contacts.update(id, {
            _deleted: true,
            updated_at: timestamps.updated_at,
            _syncStatus: 'synced'
          });

          return true;

        } catch (e) {
          console.error('Server-First Delete Failed:', e);
        }
      }

      // Check if contact exists locally
      const existingContact = await db.contacts.get(id);

      if (!existingContact || existingContact._deleted) {
        // Try server-side delete if not found locally
        await this.deleteContactFromServer(id);
        return true;
      }

      // Use standardized sync metadata for soft delete
      const syncMetadata = addSyncMetadata(existingContact, true);

      // Soft delete locally
      await db.contacts.update(id, {
        _syncStatus: syncMetadata._syncStatus,
        _lastModified: syncMetadata._lastModified,
        _version: syncMetadata._version,
        _deleted: true
      });

      // Transform for sync queue (convert Date objects to ISO strings)
      const syncData = localToSupabase(existingContact);
      await this.syncManager.addToSyncQueue('contacts', 'delete', id, syncData);

      return true;
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Delete contact from server (fallback)
   */
  private async deleteContactFromServer(id: string): Promise<void> {
    const masterUserId = await this.getMasterUserId();

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('master_user_id', masterUserId);

    if (error) throw error;
  }

  /**
   * Delete multiple contacts
   */
  async deleteMultipleContacts(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const masterUserId = await this.getMasterUserId();
      const isOnline = this.syncManager.getIsOnline();

      // Server-First Batch Delete
      if (isOnline) {
        try {
          const timestamps = addTimestamps({}, true);

          // Chunking for safe queries
          const chunkSize = 100;
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const { error } = await supabase
              .from('contacts')
              .update({
                _deleted: true,
                updated_at: timestamps.updated_at
              })
              .in('id', chunk)
              .eq('master_user_id', masterUserId);

            if (error) throw error;
          }

          await this.syncManager.triggerSync();

          return {
            success: true,
            deletedCount: ids.length
          };

        } catch (e) {
          console.error('Server-First Batch Delete Failed:', e);
        }
      }

      let deletedCount = 0;
      for (const id of ids) {
        try {
          // Fallback to individual local deletes (which handles queueing)
          // We bypass the server-first check inside deleteContact to avoid double sync if we were calling it?
          // But deleteContact now checks isOnline.
          // If we came here, it likely means isOnline is false, or server failed.
          // So calling deleteContact is safe as it will use the local path.
          await this.deleteContact(id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting contact ${id}:`, error);
        }
      }

      return {
        success: deletedCount === ids.length,
        deletedCount
      };
    } catch (error) {
      console.error('Error deleting multiple contacts:', error);
      return {
        success: false,
        deletedCount: 0
      };
    }
  }

  /**
   * Upload contacts from file (CSV/Excel)
   */
  /**
   * Upload contacts from file (CSV/Excel)
   * Now uses the xlsHandler utility in the UI layer to parse, this method receives structured data
   * But keeping this for backward compatibility or direct file handling if needed
   */
  async uploadContacts(file: File): Promise<{ success: boolean; uploaded: number; errors?: string[] }> {
    // This method is deprecated in favor of UI-layer parsing + createContacts
    // But we'll implement a basic version just in case
    // Prevent unused variable warning
    if (!file) return { success: false, uploaded: 0 };

    return {
      success: false,
      uploaded: 0,
      errors: ['Please use the new import functionality']
    };
  }


  /**
   * Set up real-time subscription for contact updates
   */
  /**
   * Set up real-time subscription for contact updates
   * @delegate ContactSyncService.subscribeToContactUpdates
   */
  subscribeToContactUpdates(callback: (contact: ContactWithGroup, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
    this.contactSyncService.subscribeToContactUpdates(callback);
  }

  /**
   * Unsubscribe from contact updates
   */
  /**
   * Unsubscribe from contact updates
   * @delegate ContactSyncService.unsubscribeFromContactUpdates
   */
  unsubscribeFromContactUpdates() {
    this.contactSyncService.unsubscribeFromContactUpdates();
  }

  /**
   * Get contact statistics
   */
  async getContactStats() {
    try {
      const masterUserId = await this.getMasterUserId();

      // Try local first
      const localContacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted)
        .toArray();

      if (localContacts.length > 0) {
        const total = localContacts.length;
        const blocked = localContacts.filter(c => c.is_blocked).length;
        const active = total - blocked;

        return {
          total,
          active,
          blocked
        };
      }

      // Fallback to server
      const { data, error } = await supabase
        .from('contacts')
        .select('is_blocked')
        .eq('master_user_id', masterUserId);

      if (error) throw error;

      const total = data?.length || 0;
      const blocked = data?.filter(c => c.is_blocked).length || 0;
      const active = total - blocked;

      return {
        total,
        active,
        blocked
      };
    } catch (error) {
      console.error('Error fetching contact stats:', error);
      throw new Error(handleDatabaseError(error));
    }
  }

  /**
   * Force sync with server
   */
  /**
   * Force sync with server
   * @delegate ContactSyncService.forceSync
   */
  async forceSync(): Promise<void> {
    return this.contactSyncService.forceSync();
  }

  /**
   * Get sync status for contacts
   */
  /**
   * Get sync status for contacts
   * @delegate ContactSyncService.getSyncStatus
   */
  async getSyncStatus() {
    return this.contactSyncService.getSyncStatus(this.masterUserId || await this.getMasterUserId());
  }

  /**
   * Get contacts filtered by lead status (CRM Pipeline)
   */
  /**
   * Get contacts by lead status (CRM Pipeline)
   * @delegate ContactQueryService.getLocalContactsByLeadStatus
   */
  async getContactsByLeadStatus(status: LeadStatus): Promise<ContactWithGroup[]> {
    try {
      const masterUserId = await this.getMasterUserId();
      const localContacts = await getLocalContactsByLeadStatus(masterUserId, status);
      return this.enrichContactsWithGroups(localContacts);
    } catch (error) {
      console.error(`Error fetching contacts with status ${status}:`, error);
      return [];
    }
  }

  /**
   * Update contact lead status directly (Pipeline Drag & Drop optimization)
   */
  async updateLeadStatus(contactId: string, status: LeadStatus, lostReason?: string): Promise<boolean> {
    try {
      const updateData: any = { lead_status: status };

      // If lost, require/save lost_reason
      if (status === 'lost' && lostReason) {
        updateData.lost_reason = lostReason;
      }

      // If moving to won, maybe set deal_value? (optional future enhancement)

      const result = await this.updateContact(contactId, updateData);
      return !!result;
    } catch (error) {
      console.error(`Error updating lead status for ${contactId}:`, error);
      return false;
    }
  }

  /**
   * Get CRM Statistics for Dashboard
   * @delegate ContactCRMService.getCRMStats
   */
  async getCRMStats(): Promise<{
    totalLeads: number;
    activeDeals: number;
    winRate: number;
    estimatedRevenue: number;
    newLeadsThisMonth: number;
    revenueGrowth: number;
  }> {
    const masterUserId = await this.getMasterUserId();
    return _getCRMStats(masterUserId);
  }

  /**
   * Get Sales Funnel Data
   * @delegate ContactCRMService.getSalesFunnel
   */
  async getSalesFunnel(): Promise<Record<string, number>> {
    const masterUserId = await this.getMasterUserId();
    return _getSalesFunnel(masterUserId);
  }

  /**
   * Get recent activity contacts
   * @delegate ContactCRMService.getRecentActivityContacts
   */
  async getRecentActivity(limit = 5): Promise<ContactWithGroup[]> {
    const masterUserId = await this.getMasterUserId();
    const contacts = await _getRecentActivityContacts(masterUserId, limit);
    return this.transformLocalContacts(contacts);
  }

  /**
   * Clean up subscriptions when service is destroyed
   */
  destroy() {
    this.unsubscribeFromContactUpdates();
    this.syncManager.destroy();
  }
}