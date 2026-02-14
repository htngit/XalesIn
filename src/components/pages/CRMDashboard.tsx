import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, DollarSign, TrendingUp, Activity, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactWithGroup } from "@/lib/services/types";
import { formatDistanceToNow } from "date-fns";
import { useIntl, FormattedMessage } from "react-intl";

interface CRMStats {
    totalLeads: number;
    activeDeals: number;
    winRate: number;
    estimatedRevenue: number;
    newLeadsThisMonth: number;
    revenueGrowth: number;
}

interface CRMDashboardProps {
    stats?: CRMStats;
    recentActivity?: ContactWithGroup[];
    isLoading?: boolean;
}

export function CRMDashboard({ stats, recentActivity = [], isLoading = false }: CRMDashboardProps) {
    const intl = useIntl();

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">
                <div className="flex gap-2">
                    <Button variant="outline">
                        <Calendar className="mr-2 h-4 w-4" />
                        <FormattedMessage id="dashboard.crm.this_month" defaultMessage="This Month" />
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.crm.total_leads" defaultMessage="Total Leads" />
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{(stats?.totalLeads || 0).toLocaleString()}</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.crm.active_leads_desc" defaultMessage="Active leads from contacts" />
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.crm.active_deals" defaultMessage="Active Deals" />
                        </CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats?.activeDeals || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.crm.open_deals_desc" defaultMessage="Open deals in pipeline" />
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.crm.win_rate" defaultMessage="Win Rate" />
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{(stats?.winRate || 0).toFixed(1)}%</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.crm.win_rate_desc" defaultMessage="Won deals / closed deals" />
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            <FormattedMessage id="dashboard.crm.revenue_est" defaultMessage="Revenue (Est)" />
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">{formatCurrency(stats?.estimatedRevenue || 0)}</div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            <FormattedMessage id="dashboard.crm.revenue_desc" defaultMessage="Total value of open deals" />
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Pipeline / Content Mockup */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>
                            <FormattedMessage id="dashboard.crm.sales_pipeline" defaultMessage="Sales Pipeline" />
                        </CardTitle>
                        <CardDescription>
                            <FormattedMessage id="dashboard.crm.pipeline_desc" defaultMessage="Recent deals and their stages" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {isLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : recentActivity.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    <FormattedMessage id="dashboard.crm.no_activity" defaultMessage="No recent activity." />
                                </p>
                            ) : (
                                recentActivity.map((contact) => (
                                    <div key={contact.id} className="flex items-center">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none truncate max-w-[200px]">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground capitalize">
                                                {contact.lead_status || intl.formatMessage({ id: 'common.status.new', defaultMessage: 'new' })} • {contact.updated_at ? formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true }) : intl.formatMessage({ id: 'common.time.recently', defaultMessage: 'Recently' })}
                                            </p>
                                        </div>
                                        <div className="ml-auto font-medium">
                                            {(contact.deal_value || 0) > 0 ? formatCurrency(contact.deal_value || 0) : '-'}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>
                            <FormattedMessage id="dashboard.crm.upcoming_interactions" defaultMessage="Upcoming Interactions" />
                        </CardTitle>
                        <CardDescription>
                            <FormattedMessage id="dashboard.crm.interactions_desc" defaultMessage="Scheduled calls and meetings" />
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Calendar className="h-8 w-8 text-muted-foreground/30 mb-2" />
                            <p className="text-sm text-muted-foreground">
                                <FormattedMessage id="dashboard.crm.no_activity" defaultMessage="No upcoming interactions scheduled." />
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
