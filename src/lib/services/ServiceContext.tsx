import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { serviceManager } from './ServiceInitializationManager';
import { TemplateService } from './TemplateService';
import { ContactService } from './ContactService';
import { GroupService } from './GroupService';
import { AssetService } from './AssetService';
import { HistoryService } from './HistoryService';
import { QuotaService } from './QuotaService';
import { AuthService } from './AuthService';
import { PaymentService } from './PaymentService';
import { MessageService } from './MessageService';
import { userContextManager } from '../security/UserContextManager';

interface ServiceContextType {
  templateService: TemplateService;
  contactService: ContactService;
  groupService: GroupService;
  assetService: AssetService;
  historyService: HistoryService;
  quotaService: QuotaService;
  authService: AuthService;
  paymentService: PaymentService;
  messageService: MessageService;
  isInitialized: boolean;
}

const ServiceContext = createContext<ServiceContextType | null>(null);

/**
 * ServiceProvider - A pass-through provider that exposes initialized services
 * 
 * Waits for services to be initialized by Dashboard before rendering children.
 * Shows a loading screen if services are not yet ready.
 */
export function ServiceProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeServices = async () => {
      // If already initialized globally, just update state
      if (serviceManager.isInitialized()) {
        if (mounted) setIsReady(true);
        return;
      }

      // If not initialized, WE must trigger it because we're blocking children from doing it.
      // This fixes the deadlock where ServiceProvider waits for Dashboard, but Dashboard is blocked by ServiceProvider.
      try {
        console.log('ServiceProvider: Triggering service initialization...');
        // We need masterUserId. Get it from context or auth service.
        // Since we are in ProtectedRoutes, user should be logged in.
        const authService = new AuthService();
        const user = await authService.getCurrentUser();

        if (user && user.master_user_id) {
          await serviceManager.initializeAllServices(user.master_user_id);
          if (mounted) setIsReady(true);
        } else {
          // If we can't get user, we can't initialize. 
          // But maybe we are in a state where we verify PIN?
          // Actually ProtectedRoutes implies authData is present.
          console.warn('ServiceProvider: Could not find masterUserId to initialize services.');
          // We keep polling in case another component (like PINModal side effects) does it?
          // But PINModal sets data then renders ProtectedRoutes.

          // Fallback: Check standard UserContextManager
          const currentMasterId = await userContextManager.getCurrentMasterUserId();
          if (currentMasterId) {
            await serviceManager.initializeAllServices(currentMasterId);
            if (mounted) setIsReady(true);
          }
        }
      } catch (err) {
        console.error('ServiceProvider: Initialization failed:', err);
      }
    };

    initializeServices();

    // Fallback polling (keep existing logic just in case)
    const checkInterval = setInterval(() => {
      if (serviceManager.isInitialized()) {
        if (mounted) {
          console.log('Services initialized (polling detected), ServiceProvider ready');
          setIsReady(true);
        }
        clearInterval(checkInterval);
      }
    }, 500); // Relax polling to 500ms

    return () => {
      mounted = false;
      clearInterval(checkInterval);
    };
  }, [isReady]);

  // Show loading state while waiting for services
  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing services...</p>
        </div>
      </div>
    );
  }

  // Safely get services with error handling
  let services: ServiceContextType | null = null;
  try {
    services = {
      templateService: serviceManager.getTemplateService(),
      contactService: serviceManager.getContactService(),
      groupService: serviceManager.getGroupService(),
      assetService: serviceManager.getAssetService(),
      historyService: serviceManager.getHistoryService(),
      quotaService: serviceManager.getQuotaService(),
      authService: serviceManager.getAuthService(),
      paymentService: serviceManager.getPaymentService(),
      messageService: serviceManager.getMessageService(),
      isInitialized: true,
    };
  } catch (error) {
    console.error('Error getting services from service manager:', error);
    // If there's an error getting services, go back to waiting state
    setIsReady(false);
    // Return loading state to prevent further execution
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing services...</p>
        </div>
      </div>
    );
  }

  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServices() {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServices must be used within a ServiceProvider');
  }
  return context;
}