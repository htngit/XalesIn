
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, DollarSign, TrendingUp, Activity, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
// import { useState } from "react";
// import { FormattedMessage } from "react-intl";
// import { Construction } from "lucide-react"; // Overlay removed
import { Skeleton } from "@/components/ui/skeleton";
import { ContactWithGroup } from "@/lib/services/types";
import { formatDistanceToNow } from "date-fns";

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
    // funnelData?: Record<string, number>; // Not used yet
    isLoading?: boolean;
}

export function CRMDashboard({ stats, recentActivity = [], isLoading = false }: CRMDashboardProps) {
    // const [showOverlay, setShowOverlay] = useState(true); // Overlay removed for Phase 4

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
            {/* Development Overlay Removed */}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">CRM Overview</h1>
                    <p className="text-muted-foreground">
                        Manage your leads, deals, and sales pipeline.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        <Calendar className="mr-2 h-4 w-4" />
                        This Month
                    </Button>
                    <Button>
                        <Users className="mr-2 h-4 w-4" />
                        Add Lead
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{(stats?.totalLeads || 0).toLocaleString()}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Active leads from contacts</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats?.activeDeals || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Open deals in pipeline</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{(stats?.winRate || 0).toFixed(1)}%</div>
                        )}
                        <p className="text-xs text-muted-foreground">Won deals / closed deals</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue (Est)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">{formatCurrency(stats?.estimatedRevenue || 0)}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Total value of open deals</p>
                    </CardContent>
                </Card>
            </div>

            {/* Pipeline / Content Mockup */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Sales Pipeline</CardTitle>
                        <CardDescription>Recent deals and their stages</CardDescription>
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
                                <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
                            ) : (
                                recentActivity.map((contact) => (
                                    <div key={contact.id} className="flex items-center">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none truncate max-w-[200px]">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground capitalize">
                                                {contact.lead_status || 'new'} • {contact.updated_at ? formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true }) : 'Recently'}
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
                        <CardTitle>Upcoming Interactions</CardTitle>
                        <CardDescription>Scheduled calls and meetings</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[
                                { title: "Demo with Product Team", time: "Today, 2:00 PM", type: "Meeting" },
                                { title: "Contract Review", time: "Tomorrow, 10:00 AM", type: "Call" },
                                { title: "Follow-up Email", time: "Fri, 4:00 PM", type: "Email" },
                            ].map((task, i) => (
                                <div key={i} className="flex items-center p-3 border rounded-lg bg-gray-50/50">
                                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-3">
                                        <Calendar className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{task.title}</p>
                                        <p className="text-xs text-muted-foreground">{task.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
