import React from 'react';

declare global {
    interface Window {
        electron: {
            ipcRenderer: {
                sendMessage(channel: string, ...args: unknown[]): void;
                on(channel: string, func: (...args: unknown[]) => void): (() => void) | undefined;
                once(channel: string, func: (...args: unknown[]) => void): void;
                invoke(channel: string, ...args: unknown[]): Promise<any>;
                removeAllListeners(channel: string): void;
            };
            whatsapp: {
                onQRCode(callback: (qr: string) => void): () => void;
                onStatusChange(callback: (status: string) => void): () => void;
                onError(callback: (error: any) => void): () => void;
                onJobProgress(callback: (data: any) => void): () => void;
                onMessageReceived(callback: (data: any) => void): () => void;
                onContactsReceived(callback: (contacts: any[]) => void): () => void;
                onSyncStatus(callback: (status: { step: string; message: string }) => void): () => void;
                resyncContacts(): Promise<boolean>;
                fetchHistory(): Promise<{ success: boolean; error?: string }>;
                getStatus(): Promise<{ status: string; ready: boolean }>;
                connect(): Promise<{ success: boolean; error?: string }>;
                disconnect(): Promise<void>;
                pauseJob(jobId: string): Promise<void>;
                resumeJob(jobId: string): Promise<void>;
                sendMessage(phone: string, content: string, assets?: string[]): Promise<{ success: boolean; error?: string }>;
                processJob(jobId: string, contacts: any[], config: any): Promise<{ success: boolean; error?: string }>;
                onJobErrorDetail(callback: (data: { jobId: string; phone: string; error: string }) => void): () => void;
            };
        };
    }

    namespace JSX {
        interface IntrinsicElements {
            webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
                src?: string;
                style?: React.CSSProperties;
                className?: string;
                allowpopups?: boolean;
                nodeintegration?: boolean;
                webpreferences?: string;
            }, HTMLElement>;
        }
    }
}
