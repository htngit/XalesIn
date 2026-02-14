/**
 * ContactQueryService.ts — Contact search and filter helpers.
 *
 * Extracted from ContactService.ts (Phase 2 refactoring).
 * Standalone functions that take db + masterUserId as context.
 * The heavy lifting of transforms and enrichment stays in ContactService.
 */

import { LeadStatus } from './types';
import { db, LocalContact } from '../db';

// ─── Search ──────────────────────────────────────────────

/**
 * Search local contacts by name, phone, or tags.
 * Returns raw LocalContact[] — caller is responsible for enrichment.
 */
export async function searchLocalContacts(
    masterUserId: string,
    query: string
): Promise<LocalContact[]> {
    const localContacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted)
        .toArray();

    const lowerQuery = query.toLowerCase();

    return localContacts.filter(contact =>
        contact.name.toLowerCase().includes(lowerQuery) ||
        contact.phone.includes(query) ||
        contact.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
    );
}

// ─── Group Filters ───────────────────────────────────────

/**
 * Get local contacts filtered by a single group ID.
 * Returns raw LocalContact[] — caller is responsible for enrichment.
 */
export async function getLocalContactsByGroupId(
    masterUserId: string,
    groupId: string
): Promise<LocalContact[]> {
    return db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted && contact.group_id === groupId)
        .toArray();
}

/**
 * Get local contacts filtered by multiple group IDs.
 * Returns raw LocalContact[] — caller is responsible for enrichment.
 */
export async function getLocalContactsByGroupIds(
    masterUserId: string,
    groupIds: string[]
): Promise<LocalContact[]> {
    return db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted && !!contact.group_id && groupIds.includes(contact.group_id))
        .toArray();
}

// ─── Lead Status Filter ─────────────────────────────────

/**
 * Get local contacts filtered by lead status (CRM Pipeline).
 * Returns raw LocalContact[] — caller is responsible for enrichment.
 */
export async function getLocalContactsByLeadStatus(
    masterUserId: string,
    status: LeadStatus
): Promise<LocalContact[]> {
    return db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(c => !c._deleted && c.lead_status === status)
        .toArray();
}

// ─── Count ───────────────────────────────────────────────

/**
 * Get count of active (non-deleted) contacts for a user.
 */
export async function getContactCount(masterUserId: string): Promise<number> {
    return db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(contact => !contact._deleted)
        .count();
}
