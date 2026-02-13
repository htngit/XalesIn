import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Send, TrendingUp } from 'lucide-react';
import { useUser } from '@/lib/security/UserProvider';
import { useServices } from '@/lib/services/ServiceContext';
import { serviceManager } from '@/lib/services';
import { Quota } from '@/lib/services/types';
import { FormattedMessage } from 'react-intl';

export function UsageTab() {
    const { masterUserId, isLoading: isUserLoading } = useUser();
    const { authService, quotaService } = useServices();

    const [isLoading, setIsLoading] = useState(true);
    const [quota, setQuota] = useState<Quota | null>(null);
    const [stats, setStats] = useState({
        totalTemplates: 0,
        messagesSent: 0,
        quotaRemaining: 0,
        quotaLimit: 0,
    });

    useEffect(() => {
        if (isUserLoading || !masterUserId) return;

        const fetchData = async () => {
            try {
                setIsLoading(true);
                const user = await authService.getCurrentUser();
                if (!user) return;

                const [currentQuota, templates] = await Promise.all([
                    quotaService.getQuota(user.id),
                    serviceManager.getTemplateService().getTemplates(),
                ]);

                if (currentQuota) {
                    setQuota(currentQuota);
                    setStats({
                        totalTemplates: templates.length,
                        messagesSent: currentQuota.messages_used || 0,
                        quotaRemaining: currentQuota.remaining || 0,
                        quotaLimit: currentQuota.messages_limit || 0,
                    });
                }
            } catch (e) {
                console.error('Error fetching usage data:', e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isUserLoading, masterUserId]);

    const quotaPercentage =
        quota && quota.messages_limit > 0
            ? (quota.remaining / quota.messages_limit) * 100
            : 0;

    const formatQuotaDisplay = (value: number) => {
        if (value >= 999999 || quota?.plan_type === 'pro') {
            return '∞';
        }
        return value.toLocaleString();
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold">
                    <FormattedMessage id="settings.usage.title" defaultMessage="Usage & Quota" />
                </h3>
                <p className="text-sm text-muted-foreground">
                    <FormattedMessage
                        id="settings.usage.description"
                        defaultMessage="Monitor your resource usage and remaining quotas."
                    />
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Templates */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.stats.templates" defaultMessage="Templates" />
                        </CardTitle>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats.totalTemplates}</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.stats.active_templates" defaultMessage="Active templates" />
                        </p>
                    </CardContent>
                </Card>

                {/* Messages Sent */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.stats.messages" defaultMessage="Messages Sent" />
                        </CardTitle>
                        <Send className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats.messagesSent}</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.stats.this_month" defaultMessage="This month" />
                        </p>
                    </CardContent>
                </Card>

                {/* Quota Usage */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.stats.quota" defaultMessage="Quota Usage" />
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    {formatQuotaDisplay(stats.quotaRemaining)} / {formatQuotaDisplay(stats.quotaLimit)}
                                </div>
                                <Progress value={quotaPercentage} className="h-2 mt-2" />
                            </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                            <FormattedMessage id="settings.usage.remaining" defaultMessage="Remaining quota" />
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
