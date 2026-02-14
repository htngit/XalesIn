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
import { Loader2 } from 'lucide-react';
import { UserProvider, useUser } from '@/lib/security/UserProvider';
import { userContextManager } from '@/lib/security/UserContextManager';
import { db } from '@/lib/db';
import { IntlProvider } from '@/lib/i18n/IntlProvider';
import { BackgroundTaskProvider } from '@/contexts/BackgroundTaskContext';
import { ScrapingProvider } from '@/contexts/ScrapingContext';
import { CampaignProvider } from '@/contexts/CampaignContext';
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
    <ServiceProvider>
      <BackgroundTaskProvider>
        <ScrapingProvider>
          <CampaignProvider>
            <Routes>
              {/* Dashboard */}
              <Route
                path="/dashboard"
                element={
                  <Dashboard
                    userName={authData?.user.name || 'User'}
                    onLogout={onLogout}
                  />
                }
              />

              {/* Inbox Chat */}
              <Route
                path="/inbox"
                element={<InboxPage />}
              />

              {/* Other pages consume services via global ServiceProvider */}
              <Route
                path="/contacts"
                element={<ContactsPage />}
              />
              <Route
                path="/templates"
                element={<TemplatesPage />}
              />
              <Route
                path="/assets"
                element={<AssetPage />}
              />
              <Route
                path="/send"
                element={<SendPage />}
              />
              <Route
                path="/history"
                element={<HistoryPage />}
              />

              <Route
                path="/groups"
                element={<GroupPage />}
              />
              <Route
                path="/settings"
                element={<SettingsPage userName={authData?.user.name || 'User'} />}
              />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </CampaignProvider>
        </ScrapingProvider>
      </BackgroundTaskProvider>
    </ServiceProvider>
  );
};

import { UpdateSplashScreen, AppUpdateInfo } from '@/components/pages/UpdateSplashScreen';
import { SyncStatusBanner } from '@/components/ui/SyncStatusBanner';

// ... (existing imports)

// Main App Logic
const MainApp = () => {
  // Use UserContext for auth state source of truth
  const { user, isLoading: isUserLoading } = useUser();

  const [pinData, setPinData] = useState<PINValidation | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ step: string; message: string } | null>(null);


  // const [isUnlocking, setIsUnlocking] ... (already above)
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



    const unsubscribeSyncStatus = window.electron?.whatsapp?.onSyncStatus?.((status: { step: string, message: string }) => {
      console.log('[App] 🔄 SYNC EVENT RECEIVED:', status.step, status.message);

      // Update global sync status state
      setSyncStatus(status);

      if (status.step === 'complete') {
        // Show success toast for completion
        sonnerToast.success(status.message, {
          id: 'sync-complete-toast',
          duration: 4000,
        });
        // Clear banner after delay
        setTimeout(() => setSyncStatus(null), 3000);
        return;
      }

      if (status.step === 'error') {
        // Show error toast
        sonnerToast.error(status.message, {
          id: 'sync-error-toast',
          duration: 5000,
        });
        // Clear banner after delay
        setTimeout(() => setSyncStatus(null), 5000);
        return;
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

    // Always clear sync timestamps to ensure a fresh session,
    // even for the same user (previous logout may have failed).
    syncManager.clearSyncTimestamps().catch(error => {
      console.warn('[App] Failed to clear sync timestamps on login:', error);
    });

    // UserProvider will update 'user' state via its own listener/logic.
    // We just need to ensure the switch happens.
    userContextManager.setLastUserId(data.user.id);
  };

  const handlePINValidated = async (data: PINValidation, accountId: string) => {
    // 1. Fetch account metadata (Quota, etc.) now that we have access
    try {
      const authService = new AuthService();
      await authService.getAccountMetadata(accountId);

      // Check for App Updates
      const { updateAvailable, updateInfo } = await authService.checkAppVersion();
      if (updateAvailable && updateInfo) {
        setUpdateInfo(updateInfo);
      }

      // Mark services as needing masterUserId for this session
      syncManager.setMasterUserId(accountId);

      setIsUnlocking(true);

      // Simulate unlock delay for smooth UX
      setTimeout(() => {
        setIsUnlocking(false);
        setPinData(data);
      }, 800);

    } catch (error) {
      console.error("Failed to load account data after PIN:", error);
      // Still proceed to unlock UI
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
      // UserProvider will handle 'user' state update
      setPinData(null);
      setUpdateInfo(null); // Clear update info
      syncManager.setMasterUserId(null);
    }
  };

  if (isUserLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const isAuthenticated = !!user;
  const isPINValidated = !!pinData?.is_valid;
  const showUpdateSplash = !!updateInfo;

  // Construct authData for child components that expect it
  const derivedAuthData: AuthResponse | null = user ? {
    user: user,
    token: '' // Token managed by UserProvider/Supabase internally
  } : null;

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

        {/* Global Sync Status Banner */}
        <SyncStatusBanner status={syncStatus} />

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
                  Selamat Datang, {user?.name}
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
              userName={user?.name || 'User'}
              userId={user?.id}
            />
          </div>
        ) : (
          // 3. Authenticated & Unlocked -> Protected Routes
          <ProtectedRoutes
            authData={derivedAuthData}
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