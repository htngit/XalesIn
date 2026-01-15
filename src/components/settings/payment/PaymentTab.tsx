import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePayment } from '@/hooks/usePayment';
import { CurrentPlanCard } from './CurrentPlanCard';
import { PricingPlans } from './PricingPlans';
import { PaymentMethodModal } from './PaymentMethodModal';
import { BillingInformationForm } from './BillingInformationForm';
import { PricingPlan } from '@/types/subscription';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { FormattedMessage, useIntl } from 'react-intl';

const SUPPORTED_PAYMENT_METHODS = ['OL', 'DA', 'LQRIS', 'NQRIS', 'BC', 'VA_BCA_A1'] as const;
type PaymentMethod = typeof SUPPORTED_PAYMENT_METHODS[number];

export default function PaymentTab() {
    const intl = useIntl();
    const { toast } = useToast();
    const { subscription, plans, history, quota, isLoading, refetchSubscription } = useSubscription();
    const { mutateAsync: createPayment, isPending: isCreating } = usePayment();

    const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSelectPlan = (plan: PricingPlan) => {
        setSelectedPlan(plan);
        setIsModalOpen(true);
    };

    const handleConfirmPayment = async (paymentMethod: PaymentMethod) => {
        if (!selectedPlan) return;

        try {
            const transaction = await createPayment({ planId: selectedPlan.id, paymentMethod });

            if (transaction && transaction.duitku_payment_url) {
                window.open(transaction.duitku_payment_url, '_blank');
                toast({
                    title: intl.formatMessage({ id: 'payment.notification.initiated' }),
                    description: intl.formatMessage({ id: 'payment.notification.initiated' }),
                });
                setIsModalOpen(false);

                setTimeout(() => {
                    refetchSubscription();
                }, 5000);
            } else {
                toast({
                    title: intl.formatMessage({ id: 'common.error' }),
                    description: intl.formatMessage({ id: 'payment.notification.url_error' }),
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Payment error:', error);
            toast({
                title: intl.formatMessage({ id: 'common.error' }),
                description: intl.formatMessage({ id: 'payment.notification.failed' }, { error: error instanceof Error ? error.message : 'Unknown error' }),
                variant: "destructive"
            });
        }
    };

    return (
        <div className="space-y-6">
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
                    <TabsTrigger value="overview">
                        <FormattedMessage id="payment.tab.overview" defaultMessage="Overview" />
                    </TabsTrigger>
                    <TabsTrigger value="upgrade">
                        <FormattedMessage id="payment.tab.upgrade" defaultMessage="Upgrade" />
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <FormattedMessage id="payment.tab.history" defaultMessage="History" />
                    </TabsTrigger>
                    <TabsTrigger value="billing">
                        <FormattedMessage id="payment.tab.billing" defaultMessage="Billing Info" />
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <CurrentPlanCard
                        subscription={subscription ?? null}
                        quota={quota ?? null}
                        isLoading={isLoading}
                        onUpgradeClick={() => {
                            const tabsList = document.querySelector('[role="tablist"]');
                            const upgradeTab = tabsList?.querySelector('[value="upgrade"]') as HTMLElement;
                            upgradeTab?.click();
                        }}
                    />
                </TabsContent>

                <TabsContent value="upgrade" className="space-y-6">
                    <div className="text-center space-y-2 mb-8">
                        <h2 className="text-3xl font-bold">
                            <FormattedMessage id="payment.upgrade.title" defaultMessage="Choose Your Plan" />
                        </h2>
                        <p className="text-muted-foreground">
                            <FormattedMessage id="payment.upgrade.subtitle" defaultMessage="Select the plan that best fits your needs" />
                        </p>
                    </div>
                    <PricingPlans
                        plans={plans || []}
                        currentPlanType={quota?.plan_type || subscription?.plan_type || 'free'}
                        onSelectPlan={handleSelectPlan}
                        isLoading={isLoading}
                    />
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <FormattedMessage id="payment.history.title" defaultMessage="Payment History" />
                            </CardTitle>
                            <CardDescription>
                                <FormattedMessage id="payment.history.description" defaultMessage="View all your past transactions" />
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!history || history.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <FormattedMessage id="payment.history.empty" defaultMessage="No payment history found" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((transaction) => (
                                        <div
                                            key={transaction.id}
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                        >
                                            <div className="space-y-1">
                                                <p className="font-medium">
                                                    {transaction.plan_purchased.charAt(0).toUpperCase() + transaction.plan_purchased.slice(1)} Plan
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {format(new Date(transaction.created_at), 'MMMM d, yyyy HH:mm')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    <FormattedMessage id="payment.history.order_id" defaultMessage="Order ID: {id}" values={{ id: transaction.merchant_order_id }} />
                                                </p>
                                            </div>
                                            <div className="text-right space-y-1">
                                                <p className="font-bold">
                                                    {new Intl.NumberFormat('id-ID', {
                                                        style: 'currency',
                                                        currency: 'IDR',
                                                        maximumFractionDigits: 0
                                                    }).format(transaction.amount)}
                                                </p>
                                                <Badge
                                                    variant={
                                                        transaction.status === 'success' ? 'default' :
                                                            transaction.status === 'pending' ? 'secondary' :
                                                                'destructive'
                                                    }
                                                >
                                                    {transaction.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="billing" className="space-y-4">
                    <BillingInformationForm />
                </TabsContent>
            </Tabs>

            <PaymentMethodModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                plan={selectedPlan ? {
                    id: selectedPlan.id,
                    name: selectedPlan.plan_name,
                    price: selectedPlan.price,
                    description: selectedPlan.description
                } : null}
                onConfirm={handleConfirmPayment}
                isProcessing={isCreating}
            />
        </div>
    );
}
