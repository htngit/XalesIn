import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ScrapedBusiness } from '@/types/scraping';
import { useServices } from '@/lib/services/ServiceContext';
import { toast } from 'sonner';
import { useBackgroundTask } from './BackgroundTaskContext';

interface ScrapingContextType {
    // State
    isScraping: boolean;
    progress: { total: number; current: number; message: string };
    results: ScrapedBusiness[];
    keyword: string;
    limit: number;
    platform: 'bing' | 'google';

    // Setters / Actions
    startScraping: (searchKeyword: string, searchLimit: number, searchPlatform: 'bing' | 'google') => Promise<void>;
    stopScraping: () => Promise<void>;
    clearResults: () => void;
    setKeyword: (k: string) => void;
    setLimit: (l: number) => void;
    setPlatform: (p: 'bing' | 'google') => void;
}

const ScrapingContext = createContext<ScrapingContextType | undefined>(undefined);

export function ScrapingProvider({ children }: { children: ReactNode }) {
    const { contactService } = useServices();
    const { setActiveTask, clearActiveTask } = useBackgroundTask();

    // State
    const [isScraping, setIsScraping] = useState(false);
    const [progress, setProgress] = useState({ total: 0, current: 0, message: '' });
    const [results, setResults] = useState<ScrapedBusiness[]>([]);

    // Configuration State (persisted here so it doesn't reset on nav)
    const [keyword, setKeyword] = useState('');
    const [limit, setLimit] = useState(50);
    const [platform, setPlatform] = useState<'bing' | 'google'>('bing');

    // Subscribe to IPC events ONCE
    useEffect(() => {
        // 1. Progress Listener
        // @ts-ignore
        const unsubscribeProgress = window.electron.mapScraping.onProgress((p: any) => {
            setProgress(prev => ({
                ...prev,
                total: p.total,
                current: p.current,
                message: p.message
            }));
            if (p.results) {
                setResults(p.results);
            }
        });

        // 2. Initial State Sync (Critical for Refresh/Reload)
        const syncState = async () => {
            try {
                // @ts-ignore
                const status = await window.electron.mapScraping.getStatus();
                if (status && status.isScraping) {
                    console.log('[ScrapingContext] Restoring active scraping state:', status);
                    setIsScraping(true);
                    if (status.progress) setProgress(status.progress);
                    if (status.results) setResults(status.results);
                }
            } catch (err) {
                console.error('[ScrapingContext] Failed to sync status:', err);
            }
        };
        syncState();

        return () => {
            if (unsubscribeProgress) unsubscribeProgress();
        };
    }, []);

    const startScraping = useCallback(async (searchKeyword: string, searchLimit: number, searchPlatform: 'bing' | 'google') => {
        if (!searchKeyword.trim()) return;

        try {
            setIsScraping(true);
            setResults([]);
            setProgress({ total: searchLimit, current: 0, message: 'Initializing scraper...' });
            setActiveTask('scraping');

            // Fetch local contacts for zero-bandwidth exclusion
            let existingPhones: string[] = [];
            try {
                // Determine if we need to fetch ALL contacts or just use a subset?
                // For now fetching all names/phones is okay (lightweight)
                const contacts = await contactService.getAllContacts();
                existingPhones = contacts.map(c => c.phone).filter(p => !!p);
                console.log(`[ScrapingContext] Loaded ${existingPhones.length} contacts for exclusion`);
            } catch (err) {
                console.warn('[ScrapingContext] Failed to load local contacts for exclusion:', err);
            }

            // @ts-ignore
            const response = await window.electron.mapScraping.scrape(searchKeyword, searchLimit, searchPlatform, existingPhones);

            if (response && response.success) {
                setResults(response.data);
                toast.success(`Found ${response.data.length} businesses`, {
                    description: "Scraping completed successfully."
                });
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Scraping error:', error);
            toast.error("Scraping Failed", {
                description: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        } finally {
            setIsScraping(false);
            clearActiveTask();
        }
    }, [contactService, setActiveTask, clearActiveTask]);

    const stopScraping = useCallback(async () => {
        try {
            // @ts-ignore
            await window.electron.mapScraping.cancel();
            setIsScraping(false);
            clearActiveTask();
            toast.info("Scraping Cancelled");
        } catch (error) {
            console.error("Failed to cancel scraping:", error);
        }
    }, [clearActiveTask]);

    const clearResults = useCallback(() => {
        setResults([]);
        setProgress({ total: 0, current: 0, message: '' });
    }, []);

    return (
        <ScrapingContext.Provider value={{
            isScraping,
            progress,
            results,
            keyword,
            limit,
            platform,
            startScraping,
            stopScraping,
            clearResults,
            setKeyword,
            setLimit,
            setPlatform
        }}>
            {children}
        </ScrapingContext.Provider>
    );
}

export function useScraping() {
    const context = useContext(ScrapingContext);
    if (context === undefined) {
        throw new Error('useScraping must be used within a ScrapingProvider');
    }
    return context;
}
