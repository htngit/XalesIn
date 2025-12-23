import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileImage, UsersRound, Database } from 'lucide-react';
import { db } from '@/lib/db';

interface DatabaseStats {
    contactsCount: number;
    assetsCount: number;
    groupsCount: number;
    databaseSize: string;
}

export function DatabaseStatsCard() {
    const [stats, setStats] = useState<DatabaseStats>({
        contactsCount: 0,
        assetsCount: 0,
        groupsCount: 0,
        databaseSize: 'Calculating...',
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Get counts
                const [contacts, groups, assets] = await Promise.all([
                    db.contacts.count(),
                    db.groups.count(),
                    db.asset_blobs.count(),
                ]);

                // Calculate asset size
                let assetsSize = 0;
                await db.asset_blobs.each((blob) => {
                    assetsSize += blob.size;
                });

                // Estimate database size (rough calculation)
                // Assuming avg sizes: Contact ~2KB, Group ~3KB, plus actual asset size
                // We exclude activity logs from calculation as requested to be hidden
                const estimatedSize = (contacts * 2048) + (groups * 3072) + assetsSize; // Bytes

                const sizeStr = estimatedSize > 1024 * 1024
                    ? `${(estimatedSize / (1024 * 1024)).toFixed(2)} MB`
                    : `${(estimatedSize / 1024).toFixed(2)} KB`;

                setStats({
                    contactsCount: contacts,
                    assetsCount: assets,
                    groupsCount: groups,
                    databaseSize: sizeStr,
                });
            } catch (error) {
                console.error('Failed to fetch database stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const statItems = [
        {
            label: 'Contacts',
            value: stats.contactsCount.toLocaleString(),
            icon: Users,
            color: 'text-blue-500',
        },
        {
            label: 'Asset Qty',
            value: stats.assetsCount.toLocaleString(),
            icon: FileImage,
            color: 'text-green-500',
        },
        {
            label: 'Groups',
            value: stats.groupsCount.toLocaleString(),
            icon: UsersRound,
            color: 'text-purple-500',
        },
        {
            label: 'Est. Size',
            value: stats.databaseSize,
            icon: Database,
            color: 'text-orange-500',
        },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Database Statistics</CardTitle>
                <CardDescription>
                    Local database usage and storage information
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    {statItems.map((item) => (
                        <div
                            key={item.label}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
                        >
                            <item.icon className={`h-5 w-5 ${item.color}`} />
                            <div>
                                <p className="text-sm text-muted-foreground">{item.label}</p>
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
