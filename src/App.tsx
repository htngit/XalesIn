'use client';

import { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LoginPage } from '@/components/pages/LoginPage';
// RegisterPage, ForgotPasswordPage, ResetPasswordPage are handled within LoginPage
// import { RegisterPage } from '@/components/pages/RegisterPage';
// import { ForgotPasswordPage } from '@/components/pages/ForgotPasswordPage';
// import { ResetPasswordPage } from '@/components/pages/ResetPasswordPage';
import { PINModal } from '@/components/pages/PINModal';
import { Dashboard } from '@/components/pages/Dashboard';
import { ContactsPage } from '@/components/pages/ContactsPage';
import { TemplatesPage } from '@/components/pages/TemplatesPage';
import { AssetPage } from '@/components/pages/AssetPage';
import { SendPage } from '@/components/pages/SendPage';
import { HistoryPage } from '@/components/pages/HistoryPage';

import { GroupPage } from '@/components/pages/GroupPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { InboxPage } from '@/components/pages/InboxPage';
import { ServiceProvider } from '@/lib/services/ServiceContext';
import { AuthResponse, PINValidation, serviceManager } from '@/lib/services';
import { AuthService } from '@/lib/services/AuthService';
import { syncManager } from '@/lib/sync/SyncManager';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { toast as sonnerToast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { UserProvider } from '@/lib/security/UserProvider';
import { userContextManager } from '@/lib/security/UserContextManager';
import { db } from '@/lib/db';
import { IntlProvider } from '@/lib/i18n/IntlProvider';

// Debug component to log location
const RouteDebug = () => {
  const location = useLocation();
  useEffect(() => {
    console.log('Current Route:', location.pathname, location.hash, location.search);
  }, [location]);
  return null;
};

// Public routes component
const PublicRoutes = ({
  onLoginSuccess
}: {
  onLoginSuccess: (data: AuthResponse) => void;
}) => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoginSuccess={onLoginSuccess} initialView="login" />} />
      <Route path="/register" element={<LoginPage onLoginSuccess={onLoginSuccess} initialView="register" />} />
      <Route path="/forgot-password" element={<LoginPage onLoginSuccess={onLoginSuccess} initialView="forgot-password" />} />
      {/* Reset Password flow to be implemented or handled via deep link to a specific view */}
      <Route path="/reset-password" element={<LoginPage onLoginSuccess={onLoginSuccess} initialView="login" />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

// Protected routes component
const ProtectedRoutes = ({
  authData,
  onLogout
}: {
  authData: AuthResponse | null;
  onLogout: () => void;
}) => {
  return (
    <Routes>
      {/* Dashboard wrapped with ServiceProvider for consistent service access */}
      <Route
        path="/dashboard"
        element={
          <ServiceProvider>
            <Dashboard
              userName={authData?.user.name || 'User'}
              onLogout={onLogout}
            />
          </ServiceProvider>
        }
      />

      {/* Inbox Chat */}
      <Route
        path="/inbox"
        element={
          <ServiceProvider>
            <InboxPage />
          </ServiceProvider>
        }
      />

      {/* Other pages consume services via ServiceProvider */}
      <Route
        path="/contacts"
        element={
          <ServiceProvider>
            <ContactsPage />
          </ServiceProvider>
        }
      />
      <Route
        path="/templates"
        element={
          <ServiceProvider>
            <TemplatesPage />
          </ServiceProvider>
        }
      />
      <Route
        path="/assets"
        element={
          <ServiceProvider>
            <AssetPage />
          </ServiceProvider>
        }
      />
      <Route
        path="/send"
        element={
          <ServiceProvider>
            <SendPage />
          </ServiceProvider>
        }
      />
      <Route
        path="/history"
        element={
          <ServiceProvider>
            <HistoryPage />
          </ServiceProvider>
        }
      />

      <Route
        path="/groups"
        element={
          <ServiceProvider>
            <GroupPage />
          </ServiceProvider>
        }
      />
      <Route
        path="/settings"
        element={
          <ServiceProvider>
            <SettingsPage userName={authData?.user.name || 'User'} />
          </ServiceProvider>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

import { UpdateSplashScreen, AppUpdateInfo } from '@/components/pages/UpdateSplashScreen';

// ... (existing imports)

// Main App Logic
const MainApp = () => {
  const { toast } = useToast();
  const [authData, setAuthData] = useState<AuthResponse | null>(null);
  const [pinData, setPinData] = useState<PINValidation | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const syncToastIdRef = useRef<string | number | undefined>(undefined);

  // Restore session on load
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const authService = new AuthService();
        const user = await authService.getCurrentUser();

        if (user) {
          // We have a user, but we don't have quota yet (fetched after PIN)
          // However, we need to set authData to consider them "authenticated"
          setAuthData({
            user,
            token: '', // Token handled by provider
            // quota is optional now
          });

          // Note: We do NOT auto-validate PIN here. 
          // User must enter PIN every time they reload/re-open app (Architecture Requirement)
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []);

  // WhatsApp Message Sync Listener (Inbox)
  useEffect(() => {
    // Only listen if PIN is validated
    if (!pinData?.is_valid) return;

    // Listen for incoming messages (new & history)
    const unsubscribeMessages = window.electron?.whatsapp?.onMessageReceived?.(async (data: any) => {
      // console.log('[App] Received message via IPC:', data.id);
      try {
        const messageService = serviceManager.getMessageService();
        await messageService.createFromIncomingWhatsApp(data);

        // We generally don't show toast for every message to avoid spamming during history sync
        // UI updates automatically via subscriptions
      } catch (err) {
        console.error('[App] Failed to save incoming message:', err);
      }
    });

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [pinData]);

  // WhatsApp Contact Sync Listener
  useEffect(() => {
    // Only listen if PIN is validated (meaning services are initialized)
    if (!pinData?.is_valid) return;

    const unsubscribeContacts = window.electron?.whatsapp?.onContactsReceived?.(async (contacts: any[]) => {
      console.log('[App] Received contacts from WhatsApp sync:', contacts.length);

      // Check Auto-Sync Setting
      const autoSync = localStorage.getItem('autoSyncContacts');
      if (autoSync === 'false') {
        console.log('[App] Skipping WhatsApp contact sync (disabled in settings)');
        return;
      }

      // Notify User Sync Started
      toast({
        title: "Syncing Contacts...",
        description: `Processing ${contacts.length} contacts from WhatsApp...`,
        duration: 3000
      });

      try {
        const contactService = serviceManager.getContactService();
        // We need to map interface
        const mapped = contacts.map(c => ({
          phone: c.phone,
          name: c.name
        }));

        const result = await contactService.upsertContactsFromWhatsApp(mapped);
        console.log('[App] WhatsApp contacts synced:', result);

        if (result.added > 0 || result.updated > 0) {
          // Using sonner toast for better visibility
          toast({
            title: "WhatsApp Sync Complete",
            description: `Synced ${result.added} new and updated ${result.updated} contacts.`,
            duration: 4000
          });
        }
      } catch (err) {
        console.error('[App] Failed to sync contacts:', err);
      }
    });

    return () => {
      if (unsubscribeContacts) unsubscribeContacts();
    };

  }, [pinData]);

  // WhatsApp Sync Status Listener (Persistent Feedback)
  useEffect(() => {
    // Debug log to confirm listener setup
    console.log('[App] Setting up WhatsApp Sync Status listener...');

    if (!pinData?.is_valid) {
      console.log('[App] PIN not valid yet, skipping sync listener.');
      return;
    }

    const unsubscribeSyncStatus = window.electron?.whatsapp?.onSyncStatus?.((status: { step: string, message: string }) => {
      console.log('[App] 🔄 SYNC EVENT RECEIVED:', status.step, status.message);

      if (status.step === 'start') {
        // Start persistent toast
        syncToastIdRef.current = sonnerToast.loading(status.message, {
          duration: Infinity,
          description: "Please wait while we sync your contacts..."
        });
      }
      else if (status.step === 'complete') {
        // Update to success and clear ref
        if (syncToastIdRef.current !== undefined) {
          sonnerToast.success(status.message, {
            id: syncToastIdRef.current,
            duration: 4000,
            description: "Your contacts are now up to date."
          });
          syncToastIdRef.current = undefined;
        } else {
          sonnerToast.success(status.message, { duration: 4000 });
        }
      }
      else if (status.step === 'error') {
        // Update to error and clear ref
        if (syncToastIdRef.current !== undefined) {
          sonnerToast.error(status.message, {
            id: syncToastIdRef.current,
            duration: 5000,
            description: "Please check your connection."
          });
          syncToastIdRef.current = undefined;
        } else {
          sonnerToast.error(status.message);
        }
      }
      else {
        // Update loading state (disconnecting, connecting, waiting)
        if (syncToastIdRef.current !== undefined) {
          sonnerToast.loading(status.message, {
            id: syncToastIdRef.current,
            duration: Infinity
          });
        } else {
          // Fallback if joined mid-stream
          syncToastIdRef.current = sonnerToast.loading(status.message, { duration: Infinity });
        }
      }
    });

    return () => {
      if (unsubscribeSyncStatus) unsubscribeSyncStatus();
    };
  }, [pinData]);

  const handleLoginSuccess = (data: AuthResponse) => {
    // Check if the current user is different from the last logged in user
    const previousUserId = userContextManager.getLastUserId();
    if (previousUserId && previousUserId !== data.user.id) {
      // Different user is logging in, clear the old user's data
      db.clearUserData(previousUserId).catch(error => {
        console.error('Error clearing old user data:', error);
      });
    }

    setAuthData(data);
    // Do NOT set PIN data yet. User must enter PIN.

    // Set the current user as the last user
    userContextManager.setLastUserId(data.user.id);
  };

  const handlePINValidated = async (data: PINValidation, accountId: string) => {
    // 1. Fetch account metadata (Quota, etc.) now that we have access
    try {
      const authService = new AuthService();
      const { quota } = await authService.getAccountMetadata(accountId);

      // Check for App Updates
      const { updateAvailable, updateInfo } = await authService.checkAppVersion();
      if (updateAvailable && updateInfo) {
        setUpdateInfo(updateInfo);
        // If mandatory, we might want to prevent further interaction, 
        // but showing the splash screen over everything works too.
      }

      // 2. Update authData with the fetched quota
      setAuthData(prev => prev ? { ...prev, quota } : null);

      // 3. Set PIN data to unlock the UI
      setPinData(data);

      // ... (existing sync logic)
      let masterUserId = authData?.user?.master_user_id;
      // ... (rest of handlePINValidated)
      // I will truncate here to avoid replacing too much, relying on careful placement
      if (!masterUserId) {
        // Fallback if authData isn't fully ready, though it should be
        const user = await authService.getCurrentUser();
        if (user) {
          masterUserId = user.master_user_id;
        }
      }

      if (masterUserId) {
        // Fix for Initial Sync Race Condition:
        // Ensure UserContextManager has the user before we attempt to sync.
        // The background auth state change might be slower than the UI flow.
        const currentUser = await userContextManager.getCurrentUser();
        if (!currentUser && authData?.user) {
          console.log('[App] Race condition detected: Injecting user into UserContextManager before sync');
          await userContextManager.setCurrentUser(authData.user, authData.token, { skipDbVerification: true });
        }

        syncManager.setMasterUserId(masterUserId);

        // 5. Check connection speed and decide sync strategy
        const { checkConnectionSpeed, getSyncPercentageBySpeed, getSyncStrategyBySpeed } = await import('@/lib/utils/connectionSpeed');
        const connectionSpeed = await checkConnectionSpeed();

        // Define sync strategy based on connection speed
        const syncStrategy = getSyncStrategyBySpeed(connectionSpeed);
        const syncPercentage = getSyncPercentageBySpeed(connectionSpeed);

        console.log(`Connection speed: ${connectionSpeed} Mbps, Strategy: ${syncStrategy}, Percentage: ${syncPercentage * 100}%`);

        // Determine which tables to sync based on strategy
        const { getTablesByPriority } = await import('@/lib/sync/SyncPriority');
        const tablesByPriority = getTablesByPriority();
        let criticalTables = tablesByPriority.critical;
        let highPriorityTables = tablesByPriority.high;
        let mediumPriorityTables = tablesByPriority.medium;
        let lowPriorityTables = tablesByPriority.low;

        // Show sync indicator to user
        // In a real implementation, you might want to show a progress indicator
        console.log(`Starting ${syncStrategy} sync...`);

        switch (syncStrategy) {
          case 'full':
            // Full sync: sync all tables
            await syncManager.sync();
            break;

          case 'partial':
            // 50% sync: sync critical and high priority tables first
            const partialTables = [...criticalTables, ...highPriorityTables];
            await syncManager.partialSync(partialTables, syncPercentage);

            // Background sync: sync remaining tables in background
            const backgroundTables = [...mediumPriorityTables, ...lowPriorityTables];
            await syncManager.backgroundSync(backgroundTables);
            break;

          case 'background':
            // Start with critical tables only, rest in background
            const criticalSyncTables = [...criticalTables];
            await syncManager.partialSync(criticalSyncTables, 1.0); // Full sync for critical

            // Background sync for all other tables
            const remainingTables = [...highPriorityTables, ...mediumPriorityTables, ...lowPriorityTables];
            await syncManager.backgroundSync(remainingTables);
            break;

          default:
            // Fallback to partial sync
            const fallbackTables = [...criticalTables, ...highPriorityTables];
            await syncManager.partialSync(fallbackTables, 0.5);
            break;
        }

        console.log('Sync completed based on connection speed');

        // Initialize all services after sync is complete
        await serviceManager.initializeAllServices(masterUserId);

        // After all services are initialized, we need to wait for any background syncs to complete
        // before running asset sync to avoid conflicts
        setTimeout(async () => {
          try {
            console.log('Waiting for background sync to complete before asset sync...');
            // Use a timeout to ensure background syncs finish
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('Starting asset sync from Supabase...');
            toast({
              title: "Syncing Assets",
              description: "Downloading your assets from the cloud...",
              duration: 3000
            });

            const assetService = serviceManager.getAssetService();
            const syncResult = await assetService.syncAssetsFromSupabase();
            console.log('Asset sync completed:', syncResult);

            if (syncResult.syncedCount > 0) {
              toast({
                title: "Assets Sync Complete",
                description: `Successfully downloaded ${syncResult.syncedCount} assets from the cloud.`,
                duration: 3000
              });
            } else if (syncResult.skippedCount === 0 && syncResult.errorCount === 0) {
              toast({
                title: "Assets Already Up-to-Date",
                description: "No new assets to download.",
                duration: 3000
              });
            }
          } catch (assetSyncError) {
            console.error('Error during asset sync from Supabase:', assetSyncError);
            toast({
              title: "Asset Sync Failed",
              description: "Could not download your assets. Please check your connection.",
              variant: "destructive",
              duration: 3000
            });
            // Continue anyway - assets are not critical for core functionality
          }
        }, 0); // Use setTimeout to move this to the next event loop cycle
      }
    } catch (error) {
      console.error("Failed to load account data after PIN:", error);
      // Handle error (maybe show toast)
      // Still proceed to unlock UI, sync will happen later if needed
      setPinData(data);
    }
  };

  const handleLogout = async () => {
    // ... (existing logout logic)
    const authService = new AuthService();
    try {
      // Disconnect WhatsApp session
      if (window.electron?.whatsapp?.disconnect) {
        console.log('[App] Disconnecting WhatsApp session...');
        await window.electron.whatsapp.disconnect();
      }

      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAuthData(null);
      setPinData(null);
      setUpdateInfo(null); // Clear update info
      syncManager.setMasterUserId(null);
    }
  };

  if (isRestoringSession) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const isAuthenticated = !!authData?.user;
  const isPINValidated = !!pinData?.is_valid;
  const showUpdateSplash = !!updateInfo;

  return (
    <Router>
      <RouteDebug />
      <div className="min-h-screen bg-background font-sans antialiased">
        {showUpdateSplash && (
          <UpdateSplashScreen
            updateInfo={updateInfo}
            currentVersion={__APP_VERSION__}
            onLater={() => !updateInfo.is_mandatory && setUpdateInfo(null)}
          />
        )}

        {!isAuthenticated ? (
          // 1. Not Authenticated -> Public Routes
          <PublicRoutes onLoginSuccess={handleLoginSuccess} />
        ) : !isPINValidated ? (
          // 2. Authenticated but Locked -> PIN Modal
          // We render this as a full-screen overlay or the only content
          <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
            <PINModal
              onPINValidated={handlePINValidated}
              userName={authData?.user.name || 'User'}
              userId={authData?.user.id}
            />
          </div>
        ) : (
          // 3. Authenticated & Unlocked -> Protected Routes
          <ProtectedRoutes
            authData={authData}
            onLogout={handleLogout}
          />
        )}
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </div>
    </Router>
  );
};

export default function App() {
  return (
    <UserProvider>
      <IntlProvider>
        <MainApp />
      </IntlProvider>
    </UserProvider>
  );
}