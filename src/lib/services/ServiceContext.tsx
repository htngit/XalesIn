import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { serviceManager } from './ServiceInitializationManager';
import { TemplateService } from './TemplateService';
import { ContactService } from './ContactService';
import { GroupService } from './GroupService';
import { AssetService } from './AssetService';
import { HistoryService } from './HistoryService';

interface ServiceContextType {
  templateService: TemplateService;
  contactService: ContactService;
  groupService: GroupService;
  assetService: AssetService;
  historyService: HistoryService;
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
    // Check if services are already initialized
    if (serviceManager.isInitialized()) {
      setIsReady(true);
      return;
    }

    // If not, wait for initialization with polling
    console.warn('ServiceProvider waiting for services to initialize...');
    const checkInterval = setInterval(() => {
      if (serviceManager.isInitialized()) {
        console.log('Services initialized, ServiceProvider ready');
        setIsReady(true);
        clearInterval(checkInterval);
      }
    }, 100); // Check every 100ms

    // Cleanup on unmount
    return () => clearInterval(checkInterval);
  }, []);

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

  const services: ServiceContextType = {
    templateService: serviceManager.getTemplateService(),
    contactService: serviceManager.getContactService(),
    groupService: serviceManager.getGroupService(),
    assetService: serviceManager.getAssetService(),
    historyService: serviceManager.getHistoryService(),
    isInitialized: true,
  };

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