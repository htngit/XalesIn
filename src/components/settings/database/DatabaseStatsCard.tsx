import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileImage, UsersRound, Database } from 'lucide-react';
import { db } from '@/lib/db';
import { serviceManager } from '@/lib/services';
import { FormattedMessage, useIntl } from 'react-intl';

interface DatabaseStats {
    contactsCount: number;
    assetsCount: number;
    groupsCount: number;
    databaseSize: string;
}

export function DatabaseStatsCard() {
    const intl = useIntl();
    const [stats, setStats] = useState<DatabaseStats>({
        contactsCount: 0,
        assetsCount: 0,
        groupsCount: 0,
        databaseSize: intl.formatMessage({ id: 'settings.database.stats.calculating', defaultMessage: 'Calculating...' }),
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Use services to ensure we respect user isolation and logic consistent with Dashboard
                const contactService = serviceManager.getContactService();
                const groupService = serviceManager.getGroupService();

                const [contacts, groups, assetsCount] = await Promise.all([
                    contactService.getAllContacts(),
                    groupService.getGroups(),
                    db.asset_blobs.count(), // Keep direct DB for assets as typical service might not expose count
                ]);

                // Calculate asset size
                let assetsSize = 0;
                await db.asset_blobs.each((blob) => {
                    assetsSize += blob.size;
                });

                // Estimate database size
                // We exclude activity logs from calculation as requested to be hidden
                const estimatedSize = (contacts.length * 2048) + (groups.length * 3072) + assetsSize; // Bytes

                const sizeStr = estimatedSize > 1024 * 1024
                    ? `${(estimatedSize / (1024 * 1024)).toFixed(2)} MB`
                    : `${(estimatedSize / 1024).toFixed(2)} KB`;

                setStats({
                    contactsCount: contacts.length,
                    assetsCount: assetsCount,
                    groupsCount: groups.length,
                    databaseSize: sizeStr,
                });
            } catch (error) {
                console.error('Failed to fetch database stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [intl]);

    const statItems = [
        {
            labelId: 'settings.database.stats.contacts',
            defaultLabel: 'Contacts',
            value: stats.contactsCount.toLocaleString(),
            icon: Users,
            color: 'text-blue-500',
        },
        {
            labelId: 'settings.database.stats.assets',
            defaultLabel: 'Asset Qty',
            value: stats.assetsCount.toLocaleString(),
            icon: FileImage,
            color: 'text-green-500',
        },
        {
            labelId: 'settings.database.stats.groups',
            defaultLabel: 'Groups',
            value: stats.groupsCount.toLocaleString(),
            icon: UsersRound,
            color: 'text-purple-500',
        },
        {
            labelId: 'settings.database.stats.size',
            defaultLabel: 'Est. Size',
            value: stats.databaseSize,
            icon: Database,
            color: 'text-orange-500',
        },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <FormattedMessage id="settings.database.stats.title" defaultMessage="Database Statistics" />
                </CardTitle>
                <CardDescription>
                    <FormattedMessage id="settings.database.stats.desc" defaultMessage="Local database usage and storage information" />
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    {statItems.map((item) => (
                        <div
                            key={item.labelId}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
                        >
                            <item.icon className={`h-5 w-5 ${item.color}`} />
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    <FormattedMessage id={item.labelId} defaultMessage={item.defaultLabel} />
                                </p>
                                <p className="text-lg font-semibold">
                                    {loading ? '...' : item.value}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
