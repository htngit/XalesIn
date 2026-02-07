import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Smartphone, CheckCircle2, XCircle, QrCode } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import QRCode from 'react-qr-code';

interface WhatsAppConnectionStatusProps {
    className?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';

export function WhatsAppConnectionStatus({ className }: WhatsAppConnectionStatusProps) {
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Check initial status on mount
    useEffect(() => {
        checkStatus();

        // Setup event listeners
        const unsubscribeQR = window.electron.whatsapp.onQRCode((qr: string) => {
            console.log('[WhatsApp] QR Code received');
            setQrCode(qr);
            setStatus('qr');
            setShowQRModal(true);
        });

        const unsubscribeStatus = window.electron.whatsapp.onStatusChange((newStatus: string) => {
            console.log('[WhatsApp] Status changed:', newStatus);
            handleStatusChange(newStatus);
        });

        const unsubscribeSync = window.electron.whatsapp.onSyncStatus((status: any) => {
            if (status.step === 'start' || status.step === 'waiting') {
                setIsSyncing(true);
            } else if (status.step === 'complete' || status.step === 'error') {
                setIsSyncing(false);
            }
        });

        // This line `setStatus('error');` was likely a debug line or misplaced.
        // It's removed as it would incorrectly set status to error on every mount.

        return () => {
            unsubscribeQR();
            unsubscribeStatus();
            // unsubscribeError() was called here but not defined. Removed.
            unsubscribeSync();
        };
    }, []);

    const checkStatus = async () => {
        try {
            const result = await window.electron.whatsapp.getStatus();
            if (result.ready) {
                setStatus('connected');
            } else {
                setStatus('disconnected');
            }
        } catch (err) {
            console.error('[WhatsApp] Failed to check status:', err);
            setStatus('disconnected');
        }
    };

    const handleStatusChange = (newStatus: string) => {
        switch (newStatus) {
            case 'ready':
                setStatus('connected');
                setShowQRModal(false);
                setQrCode(null);
                break;
            case 'connecting':
                setStatus('connecting');
                // The QR code will be handled by the separate QR event listener
                break;
            case 'authenticated':
                setStatus('connecting');
                break;
            case 'disconnected':
                setStatus('disconnected');
                setShowQRModal(false);
                setQrCode(null);
                break;
            default:
                console.log('[WhatsApp] Unknown status:', newStatus);
        }
    };

    const handleConnect = async () => {
        try {
            setStatus('connecting');
            setError(null);
            const result = await window.electron.whatsapp.connect();

            if (!result.success) {
                setError(result.error || 'Failed to connect');
                setStatus('error');
            }
            // Status will be updated via event listeners
        } catch (err) {
            console.error('[WhatsApp] Connection error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            setStatus('error');
        }
    };

    const handleDisconnect = async () => {
        try {
            await window.electron.whatsapp.disconnect();
            setStatus('disconnected');
            setQrCode(null);
        } catch (err) {
            console.error('[WhatsApp] Disconnect error:', err);
        }
    };

    const getStatusBadge = () => {
        switch (status) {
            case 'connected':
                return (
                    <Badge className="bg-green-500 hover:bg-green-600 gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        <FormattedMessage id="whatsapp.status.connected" defaultMessage="Connected" />
                    </Badge>
                );
            case 'connecting':
            case 'qr':
                return (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600 gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <FormattedMessage id="whatsapp.status.connecting" defaultMessage="Connecting" />
                    </Badge>
                );
            case 'error':
                return (
                    <Badge variant="destructive" className="gap-1.5">
                        <XCircle className="h-3 w-3" />
                        <FormattedMessage id="whatsapp.status.error" defaultMessage="Error" />
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary" className="gap-1.5">
                        <XCircle className="h-3 w-3" />
                        <FormattedMessage id="whatsapp.status.disconnected" defaultMessage="Disconnected" />
                    </Badge>
                );
        }
    };

    return (
        <>
            <div className={`flex items-center gap-3 ${className || ''}`}>
                {/* Status Badge */}
                <div className="flex flex-col items-center">
                    {getStatusBadge()}
                    {status === 'connected' && isSyncing && (
                        <span className="text-[10px] text-muted-foreground animate-pulse mt-0.5">
                            Syncing Contact...
                        </span>
                    )}
                </div>

                {/* Connect/Disconnect Button */}
                {status === 'connected' ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnect}
                        className="gap-2"
                    >
                        <Smartphone className="h-4 w-4" />
                        <FormattedMessage id="whatsapp.button.disconnect" defaultMessage="Disconnect" />
                    </Button>
                ) : (
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleConnect}
                        disabled={status === 'connecting' || status === 'qr'}
                        className="gap-2"
                    >
                        {status === 'connecting' || status === 'qr' ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <FormattedMessage id="whatsapp.button.connecting" defaultMessage="Connecting..." />
                            </>
                        ) : (
                            <>
                                <QrCode className="h-4 w-4" />
                                <FormattedMessage id="whatsapp.button.connect" defaultMessage="Connect to WhatsApp" />
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* QR Code Modal */}
            <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="h-5 w-5" />
                            <FormattedMessage id="whatsapp.qr.title" defaultMessage="Scan QR Code" />
                        </DialogTitle>
                        <DialogDescription>
                            <FormattedMessage
                                id="whatsapp.qr.description"
                                defaultMessage="Open WhatsApp on your phone and scan this QR code to connect"
                            />
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center gap-4 py-4">
                        {qrCode ? (
                            <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                                <QRCode
                                    value={qrCode}
                                    size={256}
                                    level="H"
                                    className="w-full h-auto"
                                />
                            </div>
                        ) : (
                            <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg">
                                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                            </div>
                        )}

                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">
                                <FormattedMessage
                                    id="whatsapp.qr.steps.title"
                                    defaultMessage="How to scan:"
                                />
                            </p>
                            <ol className="text-xs text-muted-foreground space-y-1 text-left">
                                <li>
                                    <FormattedMessage
                                        id="whatsapp.qr.steps.1"
                                        defaultMessage="1. Open WhatsApp on your phone"
                                    />
                                </li>
                                <li>
                                    <FormattedMessage
                                        id="whatsapp.qr.steps.2"
                                        defaultMessage="2. Tap Menu or Settings and select Linked Devices"
                                    />
                                </li>
                                <li>
                                    <FormattedMessage
                                        id="whatsapp.qr.steps.3"
                                        defaultMessage="3. Tap Link a Device"
                                    />
                                </li>
                                <li>
                                    <FormattedMessage
                                        id="whatsapp.qr.steps.4"
                                        defaultMessage="4. Point your phone at this screen to scan the QR code"
                                    />
                                </li>
                            </ol>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowQRModal(false);
                                handleDisconnect();
                            }}
                        >
                            <FormattedMessage id="common.button.cancel" defaultMessage="Cancel" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Error Display */}
            {error && status === 'error' && (
                <div className="absolute top-full mt-2 right-0 bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg max-w-sm z-50">
                    <p className="text-sm text-red-800">{error}</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setError(null)}
                        className="mt-2 text-red-600 hover:text-red-700"
                    >
                        <FormattedMessage id="common.button.dismiss" defaultMessage="Dismiss" />
                    </Button>
                </div>
            )}
        </>
    );
}
