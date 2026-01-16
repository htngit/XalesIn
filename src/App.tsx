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
import { Loader2, Minus, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProvider } from '@/lib/security/UserProvider';
import { userContextManager } from '@/lib/security/UserContextManager';
import { db } from '@/lib/db';
import { IntlProvider } from '@/lib/i18n/IntlProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


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
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showStopSyncConfirm, setShowStopSyncConfirm] = useState(false);


  // Serial Processing Queue
  const contactSyncQueue = useRef<any[][]>([]);
  const isProcessingSync = useRef(false);

  const processSyncQueue = async () => {
    if (isProcessingSync.current) return;
    isProcessingSync.current = true;

    while (contactSyncQueue.current.length > 0) {
      // 1. Check Cancellation flag before each batch
      if (localStorage.getItem('autoSyncContacts') === 'false') {
        console.log('[App] Auto-sync disabled mid-process. Clearing queue.');
        contactSyncQueue.current = []; // Clear remaining items
        isProcessingSync.current = false;
        return;
      }

      // 2. Dequeue
      const nextBatch = contactSyncQueue.current.shift();
      if (!nextBatch) continue;

      try {
        console.log(`[App] Processing batch of ${nextBatch.length} contacts...`);
        // Notify User Processing Started for this batch
        // Notify User Processing Started for this batch

        const contactService = serviceManager.getContactService();
        const mapped = nextBatch.map(c => ({
          phone: c.phone,
          name: c.name
        }));

        const result = await contactService.syncWhatsAppContactsDirectlyToServer(mapped);
        console.log('[App] WhatsApp contacts synced (Batch Result):', result);

        if (result.added > 0 || result.updated > 0) {
          // Optional: Update toast description with progress if needed
          // For now, we just let it run.
        }
      } catch (err) {
        console.error('[App] Failed to sync contact batch:', err);
      }

      // Artificial delay to yield to main thread if needed
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    isProcessingSync.current = false;

    // Final Success Toast? 
    // We let onSyncStatus 'complete' handle the final success message
    // because that event comes from the main process when Baileys sets is done.
    // However, since we process purely on 'onContactsReceived', we might finish AFTER Baileys says complete.
    // But typically 'onContactsReceived' fires during the process.
  };

  const handleStopSync = () => {
    // 1. Disable Auto-Sync
    localStorage.setItem('autoSyncContacts', 'false');
    console.log('[App] User stopped sync manually. Auto-sync disabled.');

    // Clear Queue immediately
    contactSyncQueue.current = [];

    // 2. Dismiss Sync Toast
    sonnerToast.dismiss('whatsapp-sync-toast');

    // 3. Show confirmation toast
    sonnerToast.error("Sinkronisasi Dihentikan", {
      description: "Proses sinkronisasi telah dibatalkan. Auto-sync dinonaktifkan.",
      duration: 4000
    });

    // Close modal
    setShowStopSyncConfirm(false);
  };

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

      // Notify User Sync Started (only if not already showing)
      // Note: onSyncStatus usually handles the main loading toast.

      // Enqueue
      contactSyncQueue.current.push(contacts);

      // Trigger Processing
      processSyncQueue();
    });

    return () => {
      if (unsubscribeContacts) unsubscribeContacts();
    };

  }, [pinData]);

  // WhatsApp Sync Status Listener (Persistent Feedback)
  // WhatsApp Sync Status Listener (Persistent Feedback)
  useEffect(() => {
    // Debug log to confirm listener setup
    console.log('[App] Setting up WhatsApp Sync Status listener...');

    if (!pinData?.is_valid) {
      console.log('[App] PIN not valid yet, skipping sync listener.');
      return;
    }

    const TOAST_ID = 'whatsapp-sync-toast'; // Singleton ID to prevent stacking

    const unsubscribeSyncStatus = window.electron?.whatsapp?.onSyncStatus?.((status: { step: string, message: string }) => {
      console.log('[App] 🔄 SYNC EVENT RECEIVED:', status.step, status.message);

      if (status.step === 'complete') {
        // Dismiss custom loading toast first, then show clean success
        sonnerToast.dismiss(TOAST_ID);
        sonnerToast.success(status.message, {
          id: 'sync-complete-toast', // Unique ID to prevent duplicates
          duration: 4000,
        });
        return;
      }

      if (status.step === 'error') {
        // Dismiss custom loading toast first, then show clean error
        sonnerToast.dismiss(TOAST_ID);
        sonnerToast.error(status.message, {
          id: 'sync-error-toast', // Unique ID to prevent duplicates
          duration: 5000,
        });
        return;
      }

      // for 'start', 'connecting', 'disconnecting', 'waiting' -> Show Persistent Custom Toast
      sonnerToast.custom((id) => (
        <div className="flex flex-col gap-3 w-full max-w-[340px] bg-white dark:bg-zinc-950 border p-4 rounded-lg shadow-md overflow-hidden">
          <div className="flex items-start gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 grid gap-1">
              <p className="font-medium text-sm text-zinc-950 dark:text-zinc-50 break-words leading-tight">
                {status.message}
              </p>
              {/* Removed misleading hardcoded "Syncing contacts..." text */}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-2 mt-1 dark:border-zinc-800">
            <button
              onClick={() => sonnerToast.dismiss(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
              title="Minimize (Process continues)"
            >
              <Minus className="h-3 w-3" />
              Minimize
            </button>
            <button
              onClick={() => setShowStopSyncConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              title="Stop Process"
            >
              <Square className="h-3 w-3 fill-current" />
              Hentikan
            </button>
          </div>
        </div>
      ), {
        id: TOAST_ID, // Force reuse of same ID
        duration: Infinity,
      });
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

      // 3. Trigger Unlock Transition
      setIsUnlocking(true);

      // Delay actual unlock to show Welcome Screen
      setTimeout(() => {
        setPinData(data);
        setIsUnlocking(false);
      }, 1500); // 1.5 seconds for better UX

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

        // TRIGGER WHATSAPP ENGINE START (Defer until PIN validated)
        console.log('[App] PIN Validated, starting WhatsApp engine...');
        window.electron?.whatsapp?.connect().catch(err => {
          console.error('[App] Failed to start WhatsApp engine:', err);
        });

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
        ) : isUnlocking ? (
          // 1.5 Transition -> Welcome Loader
          <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground/90">
                  Selamat Datang, {authData?.user.name}
                </h2>
                <p className="text-muted-foreground text-sm">Menyiapkan dashboard anda...</p>
              </div>
            </div>
          </div>
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

        {/* Sync Stop Confirmation Dialog */}
        <AlertDialog open={showStopSyncConfirm} onOpenChange={setShowStopSyncConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hentikan Sinkronisasi?</AlertDialogTitle>
              <AlertDialogDescription>
                Proses sinkronisasi kontak akan dihentikan saat ini juga.
                <br /><br />
                Fitur <strong>Auto Sync</strong> di pengaturan juga akan dimatikan agar sinkronisasi tidak berjalan otomatis di sesi berikutnya.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowStopSyncConfirm(false)}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleStopSync}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                Ya, Hentikan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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