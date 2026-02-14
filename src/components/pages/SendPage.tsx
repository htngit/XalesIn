import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { useServices } from '@/lib/services/ServiceContext';
import { handleServiceError } from '@/lib/utils/errorHandling';
import { userContextManager } from '@/lib/security/UserContextManager';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Template, Quota, ContactGroup, AssetFile, ContactWithGroup } from '@/lib/services/types';
import { preflightService } from '@/lib/services/PreflightService';

import { toast } from 'sonner';
import {
  FileImage,
  FileVideo,
  FileText
} from 'lucide-react';

import { formatFileSize as formatFileSizeUtil } from '@/lib/services/AssetUtils';

import { useBackgroundTask } from '@/contexts/BackgroundTaskContext';

import { SendPageContent } from './send/SendPageContent';
import { useSendCampaign } from './send/useSendCampaign';
import { SafetyWarningModal } from '@/components/ui/SafetyWarningModal';



export function SendPage() {
  const {
    contactService,
    templateService,
    quotaService,
    groupService,
    historyService,
    assetService,
    messageService,
    isInitialized
  } = useServices();

  const [contacts, setContacts] = useState<ContactWithGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(['all']);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  // Default to dynamic range [3, 10]
  const [delayRange, setDelayRange] = useState<number[]>([3, 10]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Spam Warning Modal State
  const [showSpamWarning, setShowSpamWarning] = useState(false);
  const [spamWarningReasons, setSpamWarningReasons] = useState<string[]>([]);

  // Safety Warning Modal State
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  // Task Conflict State
  const { canStartTask } = useBackgroundTask();
  const [showConflictModal, setShowConflictModal] = useState(false);

  const intl = useIntl();

  const getSelectedTemplate = () => {
    return templates.find(t => t.id === selectedTemplate);
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current user ID
      const currentUserId = await userContextManager.getCurrentMasterUserId();
      if (!currentUserId) {
        throw new Error(intl.formatMessage({
          id: 'send.error.user_not_authenticated',
          defaultMessage: 'User not authenticated'
        }));
      }

      const [contactsData, templatesData, quotaData, groupsData, assetsData] = await Promise.all([
        contactService.getContacts(),
        templateService.getTemplates(),
        quotaService.getQuota(currentUserId),
        groupService.getGroups(),
        assetService.getAssets()
      ]);

      setContacts(contactsData);
      setTemplates(templatesData);
      setQuota(quotaData);
      setGroups(groupsData);
      setAssets(assetsData);
    } catch (err) {
      console.error('Failed to load data:', err);
      const appError = handleServiceError(err, 'loadSendData');
      setError(appError.message);
      setFlowState('error');
    } finally {
      setIsLoading(false);
      // If no error, set state to ready (or idle if nothing selected)
      if (!error) setFlowState('ready');
    }
  };


  const {
    flowState,
    setFlowState,
    isSending,
    sendResult,
    validationErrors,
    showProgressModal,
    setShowProgressModal,
    activeJobId,
    handleStartCampaign,
    proceedWithCampaign
  } = useSendCampaign({
    selectedTemplate,
    selectedTemplateData: getSelectedTemplate(),
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
    refreshData: loadData,
    historyService,
    messageService,
    setQuota
  });



  // Check safety warning preference on mount
  useEffect(() => {
    const hidden = localStorage.getItem('xenderin_hide_safety_warning');
    if (!hidden) {
      setShowSafetyModal(true);
    }
  }, []);



  // Effect to validate when template changes
  useEffect(() => {
    if (selectedTemplate) {
      validateTemplateSync(selectedTemplate);
    }
  }, [selectedTemplate]);

  const validateTemplateSync = async (templateId: string) => {
    setFlowState('validating');
    const isSynced = await preflightService.ensureTemplateSync(templateId);
    if (!isSynced) {
      toast.warning(intl.formatMessage({
        id: 'send.toast.template_out_of_sync',
        defaultMessage: 'Template might be out of sync. Please refresh.'
      }));
      // We don't block yet, but we warn
    }
    setFlowState('ready');
  };

  const getTargetContacts = () => {
    if (selectedGroupIds.includes('all')) {
      return contacts;
    }
    return contacts.filter(contact => contact.group_id && selectedGroupIds.includes(contact.group_id));
  };



  const getSelectedGroups = () => {
    if (selectedGroupIds.includes('all')) {
      return [{ name: 'All Contacts', color: '#6b7280' }];
    }
    return groups.filter(g => selectedGroupIds.includes(g.id));
  };

  const getSelectedAssets = () => {
    return assets.filter(asset => selectedAssets.includes(asset.id));
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets(prev =>
      prev.includes(assetId)
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const getAssetIcon = (category: AssetFile['category']) => {
    switch (category) {
      case 'image': return FileImage;
      case 'video': return FileVideo;
      case 'document': return FileText;
      default: return FileImage;
    }
  };

  const formatFileSize = formatFileSizeUtil;



  const previewMessage = () => {
    const template = getSelectedTemplate();
    if (!template) return '';

    // Use random variant for preview to demonstrate randomization
    const randomVariant = templateService.getRandomVariant(template);
    let preview = randomVariant || '';

    // Replace variables with example values
    template.variables?.forEach(variable => {
      const exampleValue = variable.includes('name') ? 'John Doe' :
        variable.includes('amount') ? '$100' :
          variable.includes('date') ? 'December 25, 2024' :
            variable.includes('event') ? 'Product Launch' :
              variable.includes('location') ? 'Jakarta Convention Center' :
                variable.includes('product') ? 'Amazing Product' :
                  variable.includes('company') ? 'Your Company' :
                    variable.includes('contact') ? '+62812345678' :
                      `[${variable}]`;

      preview = preview.replace(new RegExp(`\\{${variable}\\}`, 'g'), exampleValue);
    });

    return preview;
  };

  useEffect(() => {
    if (isInitialized) {
      loadData();
    }
  }, [isInitialized, contactService, templateService, quotaService, groupService, assetService]);

  const targetContacts = getTargetContacts();
  const selectedTemplateData = getSelectedTemplate();
  const selectedGroupData = getSelectedGroups();
  const canSend = !!(selectedTemplate && targetContacts.length > 0 && quota && quota.remaining >= targetContacts.length);

  if (isLoading) {
    return <LoadingScreen message={intl.formatMessage({ id: 'common.status.loading', defaultMessage: 'Loading...' })} />;
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={loadData} />;
  }

  return (
    <>
      <SendPageContent
        contacts={contacts}
        templates={templates}
        quota={quota}
        groups={groups}
        assets={assets}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={setSelectedGroupIds}
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        selectedAssets={selectedAssets}
        delayRange={delayRange}
        setDelayRange={setDelayRange}
        isSending={isSending}
        sendResult={sendResult}
        handleStartCampaign={handleStartCampaign}
        targetContacts={targetContacts}
        selectedTemplateData={selectedTemplateData}
        selectedGroupData={selectedGroupData}
        canSend={canSend}
        previewMessage={previewMessage}
        getSelectedAssets={getSelectedAssets}
        toggleAssetSelection={toggleAssetSelection}
        getAssetIcon={getAssetIcon}
        formatFileSize={formatFileSize}
        showProgressModal={showProgressModal}
        setShowProgressModal={setShowProgressModal}
        activeJobId={activeJobId}
        flowState={flowState}
        validationErrors={validationErrors}
        showSpamWarning={showSpamWarning}
        setShowSpamWarning={setShowSpamWarning}
        spamWarningReasons={spamWarningReasons}
        proceedWithCampaign={proceedWithCampaign}
      />

      {/* Safety Warning Modal */}
      <SafetyWarningModal
        open={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
      />

      {/* Task Conflict Modal */}
      <AlertDialog open={showConflictModal} onOpenChange={setShowConflictModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage({ id: 'background.conflict.title', defaultMessage: 'Task Already Running' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage({
                id: 'background.conflict.scraping',
                defaultMessage: 'Scraping is currently in progress. Please wait for it to complete or stop it before starting a campaign.'
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowConflictModal(false)}>
              {intl.formatMessage({ id: 'background.conflict.dismiss', defaultMessage: 'Got it' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default SendPage;
