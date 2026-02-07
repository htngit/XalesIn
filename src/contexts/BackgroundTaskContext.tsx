import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type BackgroundTaskType = 'none' | 'scraping' | 'campaign';

interface BackgroundTaskContextType {
    activeTask: BackgroundTaskType;
    canStartTask: (taskType: BackgroundTaskType) => boolean;
    setActiveTask: (taskType: BackgroundTaskType) => void;
    clearActiveTask: () => void;
    getActiveTaskName: () => string;
}

const BackgroundTaskContext = createContext<BackgroundTaskContextType | undefined>(undefined);

export function BackgroundTaskProvider({ children }: { children: ReactNode }) {
    const [activeTask, setActiveTaskState] = useState<BackgroundTaskType>('none');

    // Sync with main process on mount to restore state after refresh
    useEffect(() => {
        const syncState = async () => {
            try {
                // Check Scraping status
                // @ts-ignore
                const scrapingStatus = await window.electron?.mapScraping?.getStatus?.();
                if (scrapingStatus?.isScraping) {
                    console.log('[BackgroundTaskContext] Restoring active scraping task');
                    setActiveTaskState('scraping');
                    return;
                }

                // Check Campaign status
                // @ts-ignore
                const campaignStatus = await window.electron?.whatsapp?.getJobStatus?.();
                if (campaignStatus?.isProcessing) {
                    console.log('[BackgroundTaskContext] Restoring active campaign task');
                    setActiveTaskState('campaign');
                    return;
                }
            } catch (err) {
                console.error('[BackgroundTaskContext] Failed to sync state:', err);
            }
        };
        syncState();
    }, []);

    const canStartTask = useCallback((taskType: BackgroundTaskType): boolean => {
        if (activeTask === 'none') return true;
        if (activeTask === taskType) return true; // Allow re-triggering same task type
        return false;
    }, [activeTask]);

    const setActiveTask = useCallback((taskType: BackgroundTaskType) => {
        console.log(`[BackgroundTaskContext] Setting active task: ${taskType}`);
        setActiveTaskState(taskType);
    }, []);

    const clearActiveTask = useCallback(() => {
        console.log('[BackgroundTaskContext] Clearing active task');
        setActiveTaskState('none');
    }, []);

    const getActiveTaskName = useCallback((): string => {
        switch (activeTask) {
            case 'scraping':
                return 'Scraping';
            case 'campaign':
                return 'Campaign';
            default:
                return '';
        }
    }, [activeTask]);

    return (
        <BackgroundTaskContext.Provider value={{
            activeTask,
            canStartTask,
            setActiveTask,
            clearActiveTask,
            getActiveTaskName
        }}>
            {children}
        </BackgroundTaskContext.Provider>
    );
}

export function useBackgroundTask() {
    const context = useContext(BackgroundTaskContext);
    if (context === undefined) {
        throw new Error('useBackgroundTask must be used within a BackgroundTaskProvider');
    }
    return context;
}
