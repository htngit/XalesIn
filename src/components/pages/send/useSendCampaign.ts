/**
 * useSendCampaign.ts — Hook for handling campaign sending logic.
 *
 * Extracted from SendPage.tsx (Phase 4 refactoring).
 * Encapsulates validation, quota reservation, and job creation.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { userContextManager } from '@/lib/security/UserContextManager';
import { HistoryService } from '@/lib/services/HistoryService';
import { MessageService } from '@/lib/services/MessageService';
import { preflightService } from '@/lib/services/PreflightService';
import { serviceManager } from '@/lib/services/ServiceInitializationManager';
import { Template, Quota, AssetFile, ContactWithGroup, ContactGroup } from '@/lib/services/types';
import { SendFlowState } from './SendPageContent';

import { BackgroundTaskType } from '@/contexts/BackgroundTaskContext';

export interface UseSendCampaignProps {
    selectedTemplate: string | null;
    selectedTemplateData: Template | undefined;
    quota: Quota | null;
    delayRange: number[];
    selectedAssets: string[];
    selectedGroupIds: string[];
    groups: ContactGroup[];
    contacts: ContactWithGroup[];
    intl: any; // React-intl shape
    canStartTask: (taskType: BackgroundTaskType) => boolean;
    setShowSpamWarning: (show: boolean) => void;
    setSpamWarningReasons: (reasons: string[]) => void;
    setShowConflictModal: (show: boolean) => void;
    assets: AssetFile[]; // To find asset URLs
    refreshData: () => Promise<void>;
    historyService: HistoryService;
    messageService: MessageService;
    setQuota: (quota: Quota | null) => void;
}

export function useSendCampaign({
    selectedTemplate,
    selectedTemplateData,
    quota,
    delayRange,
    selectedAssets,
    selectedGroupIds,
    groups,
    contacts,
    intl,
    canStartTask,
    setShowSpamWarning,
    setSpamWarningReasons,
    setShowConflictModal,
    assets,
    refreshData,
    historyService,
    messageService,
    setQuota
}: UseSendCampaignProps) {
    const [flowState, setFlowState] = useState<SendFlowState>('idle');
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<any>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [reservationId, setReservationId] = useState<string | null>(null);

    // Helper: Get target contacts based on selection
    const getTargetContacts = () => {
        if (selectedGroupIds.includes('all')) {
            return contacts;
        }
        return contacts.filter(contact => contact.group_id && selectedGroupIds.includes(contact.group_id));
    };

    // Helper: Get selected assets
    const getSelectedAssetsData = () => {
        return assets.filter(asset => selectedAssets.includes(asset.id));
    };

    // Check recent send volume in last 30 minutes
    const checkRecentSendVolume = async (): Promise<number> => {
        try {
            const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            const now = new Date().toISOString();
            const recentLogs = await historyService.getLogsByDateRange(thirtyMinsAgo, now);

            // Sum up total contacts sent in last 30 mins
            return recentLogs.reduce((sum: number, log: any) => sum + (log.total_contacts || 0), 0);
        } catch (error) {
            console.error('Failed to check recent send volume:', error);
            return 0;
        }
    };

    const handleStartCampaign = async () => {
        if (!selectedTemplate || !quota) return;

        // Check for task conflict (scraping running)
        if (!canStartTask('campaign')) {
            setShowConflictModal(true);
            return;
        }

        if (!selectedTemplateData) return;

        // --- SPAM RISK CHECK ---
        const warnings: string[] = [];

        // Check 1: Delay too low (< 10 seconds)
        if (delayRange[0] < 10) {
            warnings.push(intl.formatMessage(
                { id: 'send.spam.delay_warning', defaultMessage: 'Delay minimum {delay} detik terlalu rendah. Disarankan minimal 10 detik untuk menghindari deteksi spam.' },
                { delay: delayRange[0] }
            ));
        }

        // Check 2: Recent volume too high (>= 100 in last 30 mins)
        const recentVolume = await checkRecentSendVolume();
        if (recentVolume >= 100) {
            warnings.push(intl.formatMessage(
                { id: 'send.spam.volume_warning', defaultMessage: 'Anda sudah mengirim ke {count} kontak dalam 30 menit terakhir. Ini berisiko terdeteksi sebagai spam.' },
                { count: recentVolume }
            ));
        }

        if (warnings.length > 0) {
            setSpamWarningReasons(warnings);
            setShowSpamWarning(true);
            return; // Stop here, wait for user confirmation
        }

        // No warnings, proceed directly
        await proceedWithCampaign();
    };

    const proceedWithCampaign = async () => {
        if (!selectedTemplate || !quota) return;

        const targetContacts = getTargetContacts();
        if (!selectedTemplateData) return;

        // --- PRE-FLIGHT VALIDATION CALL ---
        setFlowState('validating');
        try {
            const preflight = await preflightService.validateSendReadiness({
                templateId: selectedTemplate,
                assetIds: selectedAssets,
                contactCount: targetContacts.length,
                checkQuota: true
            });

            if (!preflight.isReady) {
                setValidationErrors(preflight.errors.map(e => e.message));
                toast.error(intl.formatMessage(
                    { id: 'send.toast.validation_failed', defaultMessage: 'Validation failed: {message}' },
                    { message: preflight.errors[0].message }
                ));
                setFlowState('ready'); // Back to ready state to let user fix
                return;
            }

            // Additional: Ensure assets are ready (pre-download/check)
            if (selectedAssets.length > 0) {
                const assetsReady = await preflightService.ensureAssetsReady(selectedAssets);
                if (!assetsReady) {
                    throw new Error(intl.formatMessage({
                        id: 'send.error.assets_prepare_failed',
                        defaultMessage: 'Some assets could not be prepared for sending. Please try again.'
                    }));
                }
            }
        } catch (valError) {
            console.error('Preflight error:', valError);
            toast.error(intl.formatMessage(
                { id: 'send.toast.preflight_failed', defaultMessage: 'Pre-flight check failed: {message}' },
                { message: valError instanceof Error ? valError.message : intl.formatMessage({ id: 'send.common.unknown_error', defaultMessage: 'Unknown error' }) }
            ));
            setFlowState('error');
            return;
        }

        setFlowState('sending');
        setIsSending(true);
        setSendResult(null);

        try {
            // 1. Check WhatsApp Connection
            const status = await window.electron.whatsapp.getStatus();
            if (!status.ready) {
                throw new Error(intl.formatMessage({
                    id: 'send.error.whatsapp_not_connected',
                    defaultMessage: 'WhatsApp is not connected. Please connect in Dashboard first.'
                }));
            }

            // Get current user ID
            const currentUserId = await userContextManager.getCurrentMasterUserId();
            if (!currentUserId) {
                throw new Error(intl.formatMessage({
                    id: 'send.error.user_not_authenticated',
                    defaultMessage: 'User not authenticated'
                }));
            }

            // 2. Reserve quota
            const reserveResult = await serviceManager.getQuotaService().reserveQuota(currentUserId, targetContacts.length);

            if (!reserveResult.success) {
                throw new Error(intl.formatMessage({
                    id: 'send.error.reserve_quota_failed',
                    defaultMessage: 'Failed to reserve quota'
                }));
            }
            setReservationId(reserveResult.reservation_id);

            // 3. Create job in WAL
            const jobId = crypto.randomUUID();
            await db.messageJobs.add({
                id: jobId,
                reservation_id: reserveResult.reservation_id,
                user_id: currentUserId,
                master_user_id: currentUserId,
                contact_group_id: (selectedGroupIds.length === 1 && !selectedGroupIds.includes('all')) ? selectedGroupIds[0] : undefined,
                template_id: selectedTemplate,
                total_contacts: targetContacts.length,
                success_count: 0,
                failed_count: 0,
                status: 'pending',
                config: {
                    delayRange: delayRange
                } as any,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                _syncStatus: 'pending',
                _lastModified: new Date().toISOString(),
                _version: 1
            });

            // 4. Call IPC to start processing
            const assetPaths = getSelectedAssetsData().map(a => a.url).filter(Boolean) as string[];

            const result = await window.electron.whatsapp.processJob(
                jobId,
                targetContacts,
                {
                    template: selectedTemplateData,
                    assets: assetPaths,
                    delayRange: delayRange
                }
            );

            if (!result.success) {
                throw new Error(result.error || intl.formatMessage({
                    id: 'send.error.start_campaign_failed',
                    defaultMessage: 'Failed to start campaign'
                }));
            }

            // 5. Open Progress Modal
            setActiveJobId(jobId);
            setShowProgressModal(true);
            toast.success(intl.formatMessage({
                id: 'send.toast.campaign_started',
                defaultMessage: 'Campaign started successfully'
            }));

        } catch (error) {
            console.error('Campaign start failed:', error);
            toast.error(error instanceof Error
                ? error.message
                : intl.formatMessage({ id: 'send.error.start_campaign_failed', defaultMessage: 'Failed to start campaign' }));
            setIsSending(false);
            setSendResult({
                success: false,
                error: error instanceof Error
                    ? error.message
                    : intl.formatMessage({ id: 'send.common.unknown_error_occurred', defaultMessage: 'Unknown error occurred' })
            });
        }
    };

    // Listen for job errors
    useEffect(() => {
        if (!activeJobId) return;

        const unsubscribe = window.electron.whatsapp.onJobErrorDetail((data) => {
            if (data.jobId === activeJobId) {
                console.error('Job Error Detail:', data);
                toast.error(intl.formatMessage(
                    { id: 'send.toast.failed_to_send_phone', defaultMessage: 'Failed to send to {phone}: {error}' },
                    { phone: data.phone, error: data.error }
                ));
            }
        });

        return () => {
            unsubscribe();
        };
    }, [activeJobId]);

    // Listen for job completion
    useEffect(() => {
        if (!activeJobId) return;

        const unsubscribe = window.electron.whatsapp.onJobProgress(async (data) => {
            if (data.jobId === activeJobId && data.status === 'completed') {
                try {
                    const currentUserId = await userContextManager.getCurrentMasterUserId();
                    if (!currentUserId) return;

                    // Commit quota
                    if (reservationId) {
                        await serviceManager.getQuotaService().commitQuota(reservationId, data.success);
                    }

                    // Update job status
                    await db.messageJobs.update(activeJobId, {
                        status: 'completed',
                        success_count: data.success,
                        failed_count: data.failed,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                    // Create History Log with individual message logs
                    const createdLog = await historyService.createLog({
                        user_id: currentUserId as string,
                        master_user_id: currentUserId as string,
                        contact_group_id: (selectedGroupIds.length === 1 && !selectedGroupIds.includes('all')) ? selectedGroupIds[0] : undefined,
                        template_id: selectedTemplate || undefined,
                        template_name: selectedTemplateData?.name || intl.formatMessage({
                            id: 'send.common.unknown_template',
                            defaultMessage: 'Unknown Template'
                        }),
                        total_contacts: data.total,
                        success_count: data.success,
                        failed_count: data.failed,
                        status: 'completed',
                        delay_range: delayRange[0],
                        metadata: {
                            jobId: activeJobId,
                            logs: data.metadata?.logs || []
                        }
                    });

                    // Sync outbound messages to Inbox
                    if (data.metadata?.logs && Array.isArray(data.metadata.logs)) {
                        const logs = data.metadata.logs;
                        const processLogs = async () => {
                            const sentLogs = logs.filter((l: any) => l.status === 'sent');
                            const assetsList = getSelectedAssetsData();
                            const firstAsset = assetsList.length > 0 ? assetsList[0] : undefined;

                            for (const log of sentLogs) {
                                try {
                                    await messageService.createOutboundMessage({
                                        contact_id: log.contact_id,
                                        contact_phone: log.contact_phone,
                                        contact_name: log.contact_name,
                                        content: log.content || selectedTemplateData?.name || intl.formatMessage({
                                            id: 'send.common.message_sent',
                                            defaultMessage: 'Message Sent'
                                        }),
                                        activity_log_id: createdLog.id,
                                        has_media: assetsList.length > 0,
                                        media_url: firstAsset?.url || firstAsset?.file_url,
                                        message_type: (firstAsset?.category || 'text').toLowerCase()
                                    });
                                } catch (e) {
                                    console.error('Failed to sync message to inbox:', e);
                                }
                            }
                        };
                        // Run in background
                        processLogs();
                    }

                    // Update local quota state optimistically
                    if (quota) {
                        setQuota({
                            ...quota,
                            messages_used: quota.messages_used + data.success,
                            remaining: quota.remaining - data.success
                        });
                    }

                    setIsSending(false);
                    toast.success(intl.formatMessage({
                        id: 'send.toast.campaign_completed',
                        defaultMessage: 'Campaign completed!'
                    }));

                    // Update result view with full details
                    const getSelectedGroups = () => {
                        if (selectedGroupIds.includes('all')) {
                            return [{ name: 'All Contacts', color: '#6b7280' }];
                        }
                        return groups.filter(g => selectedGroupIds.includes(g.id));
                    };

                    setSendResult({
                        success: true,
                        totalContacts: data.total,
                        successCount: data.success,
                        failedCount: data.failed,
                        templateName: selectedTemplateData?.name,
                        groupName: selectedGroupIds.includes('all')
                            ? intl.formatMessage({ id: 'send.config.target.all', defaultMessage: 'All Contacts' })
                            : getSelectedGroups().map(g => g.name).join(', '),
                        selectedAssets: getSelectedAssetsData(),
                        delayRange: `${delayRange[0]}-${delayRange[1]}`,
                        reservationId: reservationId
                    });

                    setActiveJobId(null);
                    setReservationId(null);

                    // Also refresh data from server
                    await refreshData();

                } catch (err) {
                    console.error('Failed to finalize campaign:', err);
                    toast.error(intl.formatMessage({
                    id: 'send.toast.campaign_completed_save_failed',
                    defaultMessage: 'Campaign completed but failed to save results'
                }));
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, [activeJobId, reservationId, quota, delayRange, selectedGroupIds, selectedTemplate]);

    return {
        flowState,
        setFlowState,
        isSending,
        sendResult,
        validationErrors,
        showProgressModal,
        setShowProgressModal,
        activeJobId,
        reservationId,
        handleStartCampaign,
        proceedWithCampaign
    };
}
