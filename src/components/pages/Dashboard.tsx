import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AnimatedCard } from '@/components/ui/animated-card';
import { FadeIn, Stagger } from '@/components/ui/animations';
import { QuotaService, AuthService, PaymentService } from '@/lib/services';
import { Quota } from '@/lib/services/types';
import {
  BarChart3,
  Users,
  MessageSquare,
  Clock,
  TrendingUp,
  Send,
  Settings,
  LogOut,
  Menu,
  X,
  File,
  Wifi,
  WifiOff
} from 'lucide-react';

interface DashboardProps {
  userName: string;
  onLogout: () => void;
}

export function Dashboard({ userName, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // State for real-time data
  const [quota, setQuota] = useState<Quota | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({
    totalContacts: 12,
    totalTemplates: 5,
    messagesSent: 0,
    quotaRemaining: 0,
    quotaLimit: 0
  });

  // Refs for subscription management
  const quotaSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const paymentSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const quotaService = new QuotaService();
  const authService = new AuthService();
  const paymentService = new PaymentService();

  // Mock recent activity data
  const recentActivity = [
    { id: 1, type: 'send', description: 'Promo Ramadhan sent to VIP', time: '2 hours ago', status: 'success' },
    { id: 2, type: 'template', description: 'New template created', time: '5 hours ago', status: 'success' },
    { id: 3, type: 'send', description: 'Reminder Pembayaran sent', time: '1 day ago', status: 'partial' },
    { id: 4, type: 'contact', description: '3 contacts uploaded', time: '2 days ago', status: 'success' }
  ];

  const menuItems = [
    { id: 'contacts', label: 'Contacts', icon: Users, description: 'Manage your contacts' },
    { id: 'templates', label: 'Templates', icon: MessageSquare, description: 'Create and manage templates' },
    { id: 'assets', label: 'Asset Files', icon: File, description: 'Upload and manage asset files' },
    { id: 'send', label: 'Send Messages', icon: Send, description: 'Configure and send messages' },
    { id: 'history', label: 'History', icon: Clock, description: 'View activity history' },
    { id: 'settings', label: 'Settings', icon: Settings, description: 'App settings' }
  ];

  // Memoize quota user_id to prevent infinite loops
  const quotaUserId = useMemo(() => quota?.user_id, [quota]);

  // Initialize user data and setup real-time subscriptions
  useEffect(() => {
    initializeUserData();
    setupPaymentSubscription();
    return () => {
      cleanupSubscriptions();
    };
  }, []);

  // Setup quota real-time subscription when quota user_id changes
  useEffect(() => {
    if (quotaUserId) {
      setupQuotaSubscription(quotaUserId);
    }
  }, [quotaUserId]);

  const initializeUserData = async () => {
    try {
      setIsLoading(true);
      
      // Get current user
      const user = await authService.getCurrentUser();
      if (!user) {
        console.error('No authenticated user found');
        return;
      }

      // Fetch initial quota data
      const quotaData = await quotaService.getQuota(user.id);
      setQuota(quotaData);

      // Update stats with real quota data
      setStats(prevStats => ({
        ...prevStats,
        messagesSent: quotaData.messages_used,
        quotaRemaining: quotaData.remaining,
        quotaLimit: quotaData.messages_limit
      }));

    } catch (error) {
      console.error('Error initializing user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setupQuotaSubscription = (userId: string) => {
    // Clean up existing subscription
    if (quotaSubscriptionRef.current) {
      quotaSubscriptionRef.current.unsubscribe();
    }

    // Setup new subscription
    quotaSubscriptionRef.current = quotaService.subscribeToQuotaUpdates(
      userId,
      (updatedQuota) => {
        handleQuotaUpdate(updatedQuota);
        setIsConnected(true);
      }
    );
  };

  const handleQuotaUpdate = (updatedQuota: Quota) => {
    console.log('Quota updated:', updatedQuota);
    
    setQuota(updatedQuota);
    setStats(prevStats => ({
      ...prevStats,
      messagesSent: updatedQuota.messages_used,
      quotaRemaining: updatedQuota.remaining,
      quotaLimit: updatedQuota.messages_limit
    }));
  };

  const setupPaymentSubscription = async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return;

      // Subscribe to payment updates that would affect quotas
      const subscription = await paymentService.subscribeToPaymentUpdates(
        'dashboard-subscription', // This is a generic subscription for dashboard
        handlePaymentUpdate
      );
      
      paymentSubscriptionRef.current = subscription;
    } catch (error) {
      console.error('Error setting up payment subscription:', error);
    }
  };

  const handlePaymentUpdate = (paymentSession: any) => {
    console.log('Payment update received in dashboard:', paymentSession);
    
    // If payment is completed, refresh quota data
    if (paymentSession.status === 'completed') {
      // Refresh quota after successful payment
      initializeUserData();
    }
  };

  const cleanupSubscriptions = () => {
    if (quotaSubscriptionRef.current) {
      quotaSubscriptionRef.current.unsubscribe();
      quotaSubscriptionRef.current = null;
    }
    
    if (paymentSubscriptionRef.current) {
      paymentSubscriptionRef.current.unsubscribe();
      paymentSubscriptionRef.current = null;
    }
  };

  // Calculate quota percentage
  const quotaPercentage = quota && quota.messages_limit > 0
    ? ((quota.messages_limit - quota.remaining) / quota.messages_limit) * 100
    : 0;

  // Get plan badge variant
  const getPlanBadgeVariant = (planType: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (planType) {
      case 'premium':
        return 'default';
      case 'enterprise':
        return 'default';
      default:
        return 'secondary';
    }
  };

  // Get plan color
  const getPlanColor = (planType: string): string => {
    switch (planType) {
      case 'premium':
        return 'text-blue-600';
      case 'enterprise':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed z-40 w-64 h-screen bg-background border-r shadow-lg transition-transform duration-300 ease-in-out`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Xender-In</h2>
                <p className="text-sm text-muted-foreground">Welcome, {userName}</p>
                {quota && (
                  <Badge variant={getPlanBadgeVariant(quota.plan_type)} className="mt-1">
                    {quota.plan_type.charAt(0).toUpperCase() + quota.plan_type.slice(1)} Plan
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className="w-full justify-start h-auto p-3"
                onClick={() => {
                  navigate(`/${item.id}`);
                  setSidebarOpen(false);
                }}
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </div>
              </Button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64 flex flex-col min-h-screen max-w-screen-xl mx-auto px-4 lg:px-8 overflow-x-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold flex-1 text-center">Dashboard</h1>
            <div className="w-8" />
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <FadeIn>
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                    isConnected
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isConnected ? (
                      <>
                        <Wifi className="h-3 w-3" />
                        <span>Live Updates</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3" />
                        <span>Offline</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-gray-600">Overview of your WhatsApp automation system</p>
              {quota && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-500">Current Plan:</span>
                  <Badge variant={getPlanBadgeVariant(quota.plan_type)} className={getPlanColor(quota.plan_type)}>
                    {quota.plan_type.charAt(0).toUpperCase() + quota.plan_type.slice(1)}
                  </Badge>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <Stagger staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              <AnimatedCard animation="slideUp" delay={0.1} className="h-[155px] flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="text-2xl font-bold">{stats.totalContacts}</div>
                  <p className="text-xs text-muted-foreground">+2 from last month</p>
                </CardContent>
              </AnimatedCard>

              <AnimatedCard animation="slideUp" delay={0.2} className="h-[155px] flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Templates</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="text-2xl font-bold">{stats.totalTemplates}</div>
                  <p className="text-xs text-muted-foreground">Active templates</p>
                </CardContent>
              </AnimatedCard>

              <AnimatedCard animation="slideUp" delay={0.3} className="h-[155px] flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                  <Send className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="text-2xl font-bold">{stats.messagesSent.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">This month</p>
                </CardContent>
              </AnimatedCard>

              <AnimatedCard animation="slideUp" delay={0.4} className="h-[155px] flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                  <CardTitle className="text-sm font-medium">Quota Remaining</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.quotaRemaining.toLocaleString()}</div>
                  <Progress value={quotaPercentage} />
                  <p className="text-xs text-muted-foreground mt-1">{quotaPercentage.toFixed(1)}% available</p>
                  {quota && (
                    <p className="text-xs text-muted-foreground">
                      {quota.messages_limit.toLocaleString()} total limit
                    </p>
                  )}
                </CardContent>
              </AnimatedCard>
            </Stagger>

            {/* Recent Activity */}
            <AnimatedCard animation="fadeIn" delay={0.5}>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest actions in your automation system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${
                          activity.status === 'success' ? 'bg-green-500' :
                          activity.status === 'partial' ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">{activity.description}</p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                      </div>
                      <Badge variant={activity.status === 'success' ? 'default' : 'secondary'}>
                        {activity.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </AnimatedCard>
          </FadeIn>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}