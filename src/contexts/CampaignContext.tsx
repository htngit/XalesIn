import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { toast } from 'sonner';
import { useBackgroundTask } from './BackgroundTaskContext';

interface CampaignProgress {
    jobId: string;
    processed: number;
    total: number;
    success: number;
    failed: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
}

interface CampaignJob {
    jobId: string;
    contacts: any[];
    template: any;
    assets?: string[];
    delayConfig?: {
        mode: 'static' | 'dynamic';
        delayRange: number[];
    };
}

interface CampaignContextType {
    // State
    isSending: boolean;
    progress: CampaignProgress;
    currentJob: CampaignJob | null;

    // Actions
    startCampaign: (job: CampaignJob) => Promise<boolean>;
    pauseCampaign: () => Promise<void>;
    resumeCampaign: () => Promise<void>;
    stopCampaign: () => Promise<void>;
    clearCampaign: () => void;
}

const defaultProgress: CampaignProgress = {
    jobId: '',
    processed: 0,
    total: 0,
    success: 0,
    failed: 0,
    status: 'pending'
};

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: ReactNode }) {
    const { setActiveTask, clearActiveTask } = useBackgroundTask();

    const [isSending, setIsSending] = useState(false);
    const [progress, setProgress] = useState<CampaignProgress>(defaultProgress);
    const [currentJob, setCurrentJob] = useState<CampaignJob | null>(null);

    // Subscribe to IPC events
    useEffect(() => {
        console.log('[DEBUG-LOOP] CampaignContext MOUNTED');
        // 1. Progress Listener
        // @ts-ignore
        const unsubscribeProgress = window.electron?.whatsapp?.onJobProgress?.((p: any) => {
            console.log('[CampaignContext] Job progress:', p);
            setProgress({
                jobId: p.jobId,
                processed: p.processed,
                total: p.total,
                success: p.success,
                failed: p.failed,
                status: p.status
            });

            // Handle completion
            if (p.status === 'completed' || p.status === 'failed') {
                setIsSending(false);
                clearActiveTask();

                if (p.status === 'completed') {
                    toast.success('Campaign Completed', {
                        description: `Sent ${p.success}/${p.total} messages successfully`
                    });
                } else {
                    toast.error('Campaign Failed', {
                        description: `${p.failed} messages failed`
                    });
                }
            }
        });

        // 2. Initial State Sync (for refresh/reload)
        const syncState = async () => {
            try {
                // @ts-ignore
                const status = await window.electron?.whatsapp?.getJobStatus?.();
                if (status && status.isProcessing) {
                    console.log('[CampaignContext] Restoring active campaign state:', status);
                    setIsSending(true);
                    setActiveTask('campaign');
                    if (status.progress) {
                        setProgress(status.progress);
                    }
                    if (status.currentJob) {
                        setCurrentJob(status.currentJob);
                    }
                }
            } catch (err) {
                console.error('[CampaignContext] Failed to sync status:', err);
            }
        };
        syncState();

        return () => {
            console.log('[DEBUG-LOOP] CampaignContext UNMOUNTED');
            if (unsubscribeProgress) unsubscribeProgress();
        };
    }, [clearActiveTask, setActiveTask]);

    const startCampaign = useCallback(async (job: CampaignJob): Promise<boolean> => {
        try {
            setIsSending(true);
            setCurrentJob(job);
            setProgress({
                ...defaultProgress,
                jobId: job.jobId,
                total: job.contacts.length,
                status: 'processing'
            });
            setActiveTask('campaign');

            // Call IPC to start job
            // @ts-ignore
            const response = await window.electron.whatsapp.processJob({
                jobId: job.jobId,
                contacts: job.contacts,
                template: job.template,
                assets: job.assets,
                delayConfig: job.delayConfig
            });

            if (!response?.success) {
                throw new Error(response?.error || 'Failed to start campaign');
            }

            return true;
        } catch (error) {
            console.error('[CampaignContext] Start campaign error:', error);
            setIsSending(false);
            clearActiveTask();
            toast.error('Failed to start campaign', {
                description: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }, [setActiveTask, clearActiveTask]);

    const pauseCampaign = useCallback(async () => {
        try {
            // @ts-ignore
            await window.electron.whatsapp.pauseJob({ jobId: currentJob?.jobId });
            setProgress(prev => ({ ...prev, status: 'paused' }));
            toast.info('Campaign Paused');
        } catch (error) {
            console.error('[CampaignContext] Pause error:', error);
        }
    }, [currentJob]);

    const resumeCampaign = useCallback(async () => {
        try {
            // @ts-ignore
            await window.electron.whatsapp.resumeJob({ jobId: currentJob?.jobId });
            setProgress(prev => ({ ...prev, status: 'processing' }));
            toast.info('Campaign Resumed');
        } catch (error) {
            console.error('[CampaignContext] Resume error:', error);
        }
    }, [currentJob]);

    const stopCampaign = useCallback(async () => {
        try {
            // @ts-ignore
            await window.electron.whatsapp.stopJob({ jobId: currentJob?.jobId });
            setIsSending(false);
            clearActiveTask();
            toast.info('Campaign Stopped');
        } catch (error) {
            console.error('[CampaignContext] Stop error:', error);
        }
    }, [currentJob, clearActiveTask]);

    const clearCampaign = useCallback(() => {
        setProgress(defaultProgress);
        setCurrentJob(null);
    }, []);

    return (
        <CampaignContext.Provider value={{
            isSending,
            progress,
            currentJob,
            startCampaign,
            pauseCampaign,
            resumeCampaign,
            stopCampaign,
            clearCampaign
        }}>
            {children}
        </CampaignContext.Provider>
    );
}

export function useCampaign() {
    const context = useContext(CampaignContext);
    if (context === undefined) {
        throw new Error('useCampaign must be used within a CampaignProvider');
    }
    return context;
}
