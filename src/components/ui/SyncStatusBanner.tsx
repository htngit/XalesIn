'use client';

import { Loader2 } from 'lucide-react';


interface SyncStatusBannerProps {
    status: {
        step: string;
        message: string;
    } | null;
}

export function SyncStatusBanner({ status }: SyncStatusBannerProps) {
    if (!status) return null;

    // Only show for active states
    if (status.step === 'idle' || status.step === 'complete' || status.step === 'error') {
        return null;
    }

    return (
        <div className="w-full bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 px-4 py-2 flex items-center justify-center gap-2 transition-all duration-300">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {status.message}
            </span>
        </div>
    );
}
