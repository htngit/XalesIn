import React, { useEffect, useState } from 'react';
import { serviceManager } from '@/lib/services/ServiceInitializationManager';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface ProgressState {
    current: number;
    total: number;
    table: string;
    status: 'idle' | 'processing' | 'completed';
}

export const SyncProgressToast: React.FC = () => {
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const syncManager = serviceManager.getSyncManager();
        const handleProgress = (data: any) => {
            // Only show for contacts (the heavy table)
            if (data.table === 'contacts' && data.phase === 'processing') {
                setProgress({
                    current: data.current,
                    total: data.total,
                    table: data.table,
                    status: 'processing'
                });
                setIsVisible(true);
            }
        };

        const handleComplete = (data: any) => {
            if (data.table === 'contacts') {
                setProgress(prev => prev ? { ...prev, status: 'completed', current: prev.total } : null);
                // Auto hide after 2 seconds
                setTimeout(() => {
                    setIsVisible(false);
                    setTimeout(() => setProgress(null), 500); // Clear state after exit animation
                }, 2000);
            }
        };

        const listener = (event: any) => {
            if (event.type === 'sync_progress') {
                handleProgress(event);
            } else if (event.type === 'sync_complete') {
                handleComplete(event);
            }
        };

        syncManager.addEventListener(listener);

        return () => {
            syncManager.removeEventListener(listener);
        };
    }, []);

    if (!progress && !isVisible) return null;

    const percentage = progress ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="fixed bottom-6 right-6 z-50"
                >
                    {/* Minimal circular progress - no card, no text */}
                    <div className="relative flex items-center justify-center w-14 h-14 bg-white/90 dark:bg-slate-900/90 rounded-full shadow-lg backdrop-blur border border-gray-200 dark:border-gray-700">
                        {/* SVG Progress Circle */}
                        <svg className="transform -rotate-90 w-12 h-12">
                            <circle
                                className="text-gray-200 dark:text-gray-700"
                                strokeWidth="3"
                                stroke="currentColor"
                                fill="transparent"
                                r={radius}
                                cx="24"
                                cy="24"
                            />
                            <circle
                                className={cn(
                                    "transition-all duration-300 ease-linear",
                                    progress?.status === 'completed' ? "text-green-500" : "text-indigo-600"
                                )}
                                strokeWidth="3"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="transparent"
                                r={radius}
                                cx="24"
                                cy="24"
                            />
                        </svg>
                        {/* Center Content: Percentage or Check */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {progress?.status === 'completed' ? (
                                <Check className="w-5 h-5 text-green-500" />
                            ) : (
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{percentage}%</span>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
