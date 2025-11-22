import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Subscription } from '@/types/subscription';
import { UserQuota } from '@/lib/services/SubscriptionService';
import { format } from 'date-fns';
import { Loader2, Zap } from 'lucide-react';

interface CurrentPlanCardProps {
    subscription: Subscription | null;
    quota: UserQuota | null;
    isLoading: boolean;
    onUpgradeClick: () => void;
}

export function CurrentPlanCard({ subscription, quota, isLoading, onUpgradeClick }: CurrentPlanCardProps) {
    if (isLoading) {
        return (
            <Card>
                <CardContent className="pt-6 flex justify-center items-center min-h-[200px]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    // Use quota as source of truth for plan_type
    const planType = quota?.plan_type || subscription?.plan_type || 'free';
    const isPro = planType === 'pro';
    const isActive = subscription?.status === 'active';

    // Quota Logic
    const limit = quota?.messages_limit || 0;
    const used = quota?.messages_used || 0;
    // If limit is very high (e.g. >= 999999) or plan is pro, treat as unlimited
    const isUnlimited = isPro || limit >= 999999;
    const percentage = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);

    // Renewal date from quota reset_date or subscription valid_until
    const renewalDate = quota?.reset_date || subscription?.valid_until;

    // Billing cycle - infer from quota or use subscription
    const getBillingCycle = () => {
        if (quota?.reset_date) {
            const resetDate = new Date(quota.reset_date);
            const now = new Date();
            const diffDays = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            // If reset is ~365 days away, it's yearly
            if (diffDays > 300) return 'Yearly';
            // If reset is ~30 days away, it's monthly
            if (diffDays > 20 && diffDays < 40) return 'Monthly';
        }
        return subscription?.billing_cycle || 'Monthly';
    };

    // Amount - for Pro yearly it's Rp 960,000
    const getAmount = () => {
        if (isPro) {
            const billingCycle = getBillingCycle();
            return billingCycle === 'Yearly' ? 960000 : 100000;
        }
        return subscription?.price || 0;
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            {planType.charAt(0).toUpperCase() + planType.slice(1)} Plan
                            {isActive && <Badge variant="default" className="bg-green-500">Active</Badge>}
                        </CardTitle>
                        <CardDescription>
                            {renewalDate
                                ? `Renews on ${format(new Date(renewalDate), 'MMMM d, yyyy')}`
                                : 'You are currently on the free plan'}
                        </CardDescription>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-full">
                        <Zap className="h-6 w-6 text-primary" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Quota Usage */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                        <span>Message Quota</span>
                        <span>
                            {used.toLocaleString()} / {isUnlimited ? <span className="text-lg leading-none">∞</span> : limit.toLocaleString()}
                        </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                        {isUnlimited
                            ? 'You have unlimited messages'
                            : `${(limit - used).toLocaleString()} messages remaining this month`}
                    </p>
                </div>

                {/* Plan Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-muted-foreground">Billing Cycle</p>
                        <p className="font-medium">{getBillingCycle()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-medium">
                            {planType === 'free'
                                ? 'Free'
                                : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(getAmount())}
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                {!isPro && (
                    <Button onClick={onUpgradeClick} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg">
                        Upgrade Plan
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
