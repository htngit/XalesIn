/**
 * ContactCRMService.ts — CRM analytics and pipeline functions.
 *
 * Extracted from ContactService.ts (Phase 2 refactoring).
 * Standalone read-only functions that query IndexedDB directly.
 */

import { db, LocalContact } from '../db';

// ─── CRM Stats ───────────────────────────────────────────

export interface CRMStats {
    totalLeads: number;
    activeDeals: number;
    winRate: number;
    estimatedRevenue: number;
    newLeadsThisMonth: number;
    revenueGrowth: number;
}

/**
 * Get CRM Statistics for Dashboard.
 * Aggregates local contact data for performance.
 */
export async function getCRMStats(masterUserId: string): Promise<CRMStats> {
    const contacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(c => !c._deleted)
        .toArray();

    const totalLeads = contacts.length;

    // Active deals: status IN ['contacted', 'qualified', 'negotiation'] OR (value > 0 AND status != 'won' AND status != 'lost')
    const activeDeals = contacts.filter(c => {
        const status = c.lead_status || 'new';
        return (status !== 'won' && status !== 'lost' && status !== 'new') || ((c.deal_value || 0) > 0 && status !== 'won' && status !== 'lost');
    }).length;

    // Win Rate: Won / (Won + Lost)
    const wonCount = contacts.filter(c => c.lead_status === 'won').length;
    const lostCount = contacts.filter(c => c.lead_status === 'lost').length;
    const closedCount = wonCount + lostCount;
    const winRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;

    // Estimated Revenue: Sum of deal_value for open deals
    const estimatedRevenue = contacts
        .filter(c => {
            const status = c.lead_status || 'new';
            return status !== 'won' && status !== 'lost';
        })
        .reduce((sum, c) => sum + (c.deal_value || 0), 0);

    // New leads this month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newLeadsThisMonth = contacts.filter(c => c.created_at >= firstDay).length;

    return {
        totalLeads,
        activeDeals,
        winRate,
        estimatedRevenue,
        newLeadsThisMonth,
        revenueGrowth: 0 // Placeholder — needs historical data
    };
}

// ─── Sales Funnel ────────────────────────────────────────

/**
 * Get Sales Funnel Data — counts contacts per pipeline stage.
 */
export async function getSalesFunnel(masterUserId: string): Promise<Record<string, number>> {
    const contacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(c => !c._deleted)
        .toArray();

    const funnel: Record<string, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        negotiation: 0,
        won: 0,
        lost: 0
    };

    contacts.forEach(c => {
        const status = c.lead_status || 'new';
        if (funnel[status] !== undefined) {
            funnel[status]++;
        } else {
            funnel['new']++;
        }
    });

    return funnel;
}

// ─── Recent Activity ─────────────────────────────────────

/**
 * Get recently updated contacts (raw LocalContact[]).
 * Caller is responsible for transformation.
 */
export async function getRecentActivityContacts(
    masterUserId: string,
    limit: number = 5
): Promise<LocalContact[]> {
    const contacts = await db.contacts
        .where('master_user_id')
        .equals(masterUserId)
        .and(c => !c._deleted)
        .reverse()
        .sortBy('updated_at');

    return contacts.slice(0, limit);
}
