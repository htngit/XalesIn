
import { db } from '../db';
import {
    Contact,
    Message,
    Template,
    AssetFile,
    ActivityLog,
    User
} from './types';

export type ActivityType =
    | 'contact'
    | 'message'
    | 'template'
    | 'asset'
    | 'inbox_message'
    | 'campaign';

export interface DashboardActivity {
    id: string;
    type: ActivityType;
    title: string;
    description: string;
    timestamp: string;
    metadata?: any;
}

export class ActivityService {
    private static instance: ActivityService;
    private listeners: (() => void)[] = [];

    private constructor() { }

    static getInstance(): ActivityService {
        // Development-only persistence to handle HMR
        if (process.env.NODE_ENV === 'development') {
            const globalKey = '__ActivityServiceInstance__';
            const globalScope = globalThis as any;
            if (!globalScope[globalKey]) {
                globalScope[globalKey] = new ActivityService();
            }
            return globalScope[globalKey];
        }

        if (!ActivityService.instance) {
            ActivityService.instance = new ActivityService();
        }
        return ActivityService.instance;
    }

    /**
     * Get aggregated recent activities from multiple sources
     * This avoids creating a new table and uses existing indexed data
     */
    async getRecentActivities(limit: number = 10, masterUserId: string): Promise<DashboardActivity[]> {
        try {
            // 1. Fetch recent contacts
            const recentContacts = await db.contacts
                .where('master_user_id')
                .equals(masterUserId)
                .reverse()
                .sortBy('created_at')
                .then(contacts => contacts.slice(0, limit));

            // 2. Fetch recent messages (outbound)
            const recentMessages = await db.messages
                .where('master_user_id')
                .equals(masterUserId)
                .reverse()
                .sortBy('created_at')
                .then(msgs => msgs.slice(0, limit));

            // 3. Fetch recent templates (Created)
            const recentCreatedTemplates = await db.templates
                .where('master_user_id')
                .equals(masterUserId)
                .reverse()
                .sortBy('created_at')
                .then(tmpls => tmpls.slice(0, limit));

            // 3b. Fetch recent templates (Deleted)
            const recentDeletedTemplates = await db.templates
                .where('master_user_id')
                .equals(masterUserId)
                .filter(t => !!t._deleted)
                .reverse()
                .sortBy('updated_at')
                .then(tmpls => tmpls.slice(0, limit));

            const recentTemplates = [...recentCreatedTemplates, ...recentDeletedTemplates];

            // 4. Fetch recent assets
            const recentAssets = await db.assets
                .where('master_user_id')
                .equals(masterUserId)
                .reverse()
                .sortBy('created_at')
                .then(assets => assets.slice(0, limit));

            // 5. Fetch recent campaign logs (legacy & new campaigns)
            const recentCampaigns = await db.activityLogs
                .where('master_user_id')
                .equals(masterUserId)
                .reverse()
                .sortBy('created_at')
                .then(logs => logs.slice(0, limit));

            // Map to common interface
            const activities: DashboardActivity[] = [
                ...recentContacts.map(c => this.mapContactToActivity(c)),
                ...recentMessages.map(m => this.mapMessageToActivity(m)),
                ...recentTemplates.map(t => this.mapTemplateToActivity(t)),
                ...recentAssets.map(a => this.mapAssetToActivity(a)),
                ...recentCampaigns.map(c => this.mapCampaignToActivity(c)),
            ];

            // Sort combined list and take top N
            return activities
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, limit);

        } catch (error) {
            console.error('Error fetching recent activities:', error);
            return []; // Return empty array gracefully
        }
    }

    // --- Mappers ---

    private mapContactToActivity(contact: any): DashboardActivity {
        return {
            id: contact.id,
            type: 'contact',
            title: contact.name,
            description: contact.phone,
            timestamp: contact.created_at,
            metadata: { group_id: contact.group_id }
        };
    }

    private mapMessageToActivity(message: any): DashboardActivity {
        const isInbox = message.direction === 'inbound';
        return {
            id: message.id,
            type: isInbox ? 'inbox_message' : 'message',
            title: isInbox ? (message.contact_name || message.contact_phone) : `Sent to ${message.contact_name || message.contact_phone}`,
            description: message.content || (message.has_media ? 'Media attachment' : 'Message'),
            timestamp: message.created_at,
            metadata: { status: message.status }
        };
    }

    private mapTemplateToActivity(template: any): DashboardActivity {
        const isDeleted = template._deleted;
        return {
            id: template.id,
            type: 'template',
            title: isDeleted ? `Deleted Template: ${template.name}` : template.name,
            description: isDeleted ? 'Template was deleted' : template.category,
            timestamp: isDeleted ? (template.updated_at || template.created_at) : template.created_at,
            metadata: { is_deleted: isDeleted }
        };
    }

    private mapAssetToActivity(asset: any): DashboardActivity {
        const assetType = asset.type || asset.file_type || 'file';
        const assetSize = asset.size || asset.file_size || 0;
        return {
            id: asset.id,
            type: 'asset',
            title: asset.name || 'Unnamed Asset',
            description: `${assetType.toUpperCase()} - ${(assetSize / 1024).toFixed(1)} KB`,
            timestamp: asset.created_at,
        };
    }

    private mapCampaignToActivity(log: any): DashboardActivity {
        return {
            id: log.id,
            type: 'campaign',
            title: log.template_name || 'Campaign',
            description: `Sent to ${log.total_contacts} contacts (${log.success_count} success)`,
            timestamp: log.created_at,
            metadata: {
                status: log.status,
                success_count: log.success_count,
                failed_count: log.failed_count
            }
        };
    }

    /**
     * Subscribe to real-time updates
     * (Ideally, this should hook into specific service events, but for now we'll just expose the mechanism)
     */
    subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyListeners() {
        this.listeners.forEach(l => l());
    }
}

export const activityService = ActivityService.getInstance();
