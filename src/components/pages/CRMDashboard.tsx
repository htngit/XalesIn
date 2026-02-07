
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, DollarSign, TrendingUp, Activity, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { Construction } from "lucide-react";

export function CRMDashboard() {
    const [showOverlay, setShowOverlay] = useState(true);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative">
            {/* Development Overlay */}
            {showOverlay && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-lg border-2 border-dashed border-orange-200">
                    <div className="bg-white p-8 rounded-xl shadow-2xl border border-orange-100 max-w-md text-center space-y-4 animate-in zoom-in-50 duration-300">
                        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto ring-4 ring-orange-50">
                            <Construction className="h-8 w-8 text-orange-600" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-gray-900">
                                <FormattedMessage id="crm.dev.title" defaultMessage="Feature Under Development" />
                            </h3>
                            <p className="text-gray-500">
                                <FormattedMessage
                                    id="crm.dev.desc"
                                    defaultMessage="The CRM module is currently being built. This is a Preview (Mockup) of what is coming soon."
                                />
                            </p>
                        </div>
                        <Button
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => setShowOverlay(false)}
                        >
                            <FormattedMessage id="crm.dev.button" defaultMessage="Okay, I Understand" />
                        </Button>
                    </div>
                </div>
            )}

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
                        <div className="text-2xl font-bold">1,248</div>
                        <p className="text-xs text-muted-foreground">+18% from last month</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">45</div>
                        <p className="text-xs text-muted-foreground">+5 new this week</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">32.5%</div>
                        <p className="text-xs text-muted-foreground">+2.4% from last month</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue (Est)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$124,500</div>
                        <p className="text-xs text-muted-foreground">+12% from last month</p>
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
                            {[
                                { name: "TechCorp Enterprise Deal", stage: "Negotiation", value: "$15,000", date: "2 mins ago" },
                                { name: "Small Biz Upgrade", stage: "Qualified", value: "$2,500", date: "1 hour ago" },
                                { name: "Startup Launch Pack", stage: "Proposal", value: "$5,000", date: "3 hours ago" },
                                { name: "Retail Chain Integration", stage: "Discovery", value: "$45,000", date: "Yesterday" },
                                { name: "Consulting Services", stage: "Closed Won", value: "$8,500", date: "2 days ago" },
                            ].map((deal, i) => (
                                <div key={i} className="flex items-center">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">{deal.name}</p>
                                        <p className="text-xs text-muted-foreground">{deal.stage} • {deal.date}</p>
                                    </div>
                                    <div className="ml-auto font-medium">{deal.value}</div>
                                </div>
                            ))}
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
