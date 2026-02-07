import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/lib/services/ServiceContext';
import { handleServiceError } from '@/lib/utils/errorHandling';
import { cn } from '@/lib/utils';
import { userContextManager } from '@/lib/security/UserContextManager';
import { db } from '@/lib/db';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedCard } from '@/components/ui/animated-card';
import { FadeIn } from '@/components/ui/animations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Template, Quota, ContactGroup, AssetFile, ContactWithGroup } from '@/lib/services/types';
import { preflightService } from '@/lib/services/PreflightService';
import { JobProgressModal } from '@/components/ui/JobProgressModal';
import { toast } from 'sonner';
import {
  Send,
  MessageSquare,
  Clock,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Zap,
  Target,
  Settings,
  Paperclip,
  FileImage,
  FileText,
  FileVideo,
  ChevronsUpDown,
  Check,
  X
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBackgroundTask } from '@/contexts/BackgroundTaskContext';

const PRESET_DELAYS = [1, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900];

type SendFlowState = 'idle' | 'validating' | 'ready' | 'sending' | 'done' | 'error';

const formatDelayLabel = (seconds: number) => {
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m`;
  }
  return `${seconds}s`;
};

// Placeholder content component for when data is loaded
function SendPageContent({
  contacts,
  templates,
  quota,
  groups,
  assets,
  selectedGroupIds,
  setSelectedGroupIds,
  selectedTemplate,
  setSelectedTemplate,
  selectedAssets,
  delayRange,
  setDelayRange,
  isSending,
  sendResult,
  handleStartCampaign,
  targetContacts,
  selectedTemplateData,
  selectedGroupData,
  canSend,
  previewMessage,
  getSelectedAssets,
  toggleAssetSelection,
  getAssetIcon,
  formatFileSize,
  showProgressModal,
  setShowProgressModal,
  activeJobId,
  flowState,
  validationErrors,
  showSpamWarning,
  setShowSpamWarning,
  spamWarningReasons,
  proceedWithCampaign
}: {
  contacts: ContactWithGroup[];
  templates: Template[];
  quota: Quota | null;
  groups: ContactGroup[];
  assets: AssetFile[];
  selectedGroupIds: string[];
  setSelectedGroupIds: (ids: string[]) => void;
  selectedTemplate: string;
  setSelectedTemplate: (id: string) => void;
  selectedAssets: string[];
  delayRange: number[];
  setDelayRange: (range: number[]) => void;
  isSending: boolean;
  sendResult: any;
  handleStartCampaign: () => void;
  targetContacts: ContactWithGroup[];
  selectedTemplateData: Template | undefined;
  selectedGroupData: (ContactGroup | { name: string; color: string })[];
  canSend: boolean;
  previewMessage: () => string;
  getSelectedAssets: () => AssetFile[];
  toggleAssetSelection: (assetId: string) => void;
  getAssetIcon: (category: AssetFile['category']) => React.ComponentType<any>;
  formatFileSize: (bytes: number) => string;
  showProgressModal: boolean;
  setShowProgressModal: (show: boolean) => void;
  activeJobId: string | null;
  flowState: SendFlowState;
  validationErrors: string[];
  showSpamWarning: boolean;
  setShowSpamWarning: (show: boolean) => void;
  spamWarningReasons: string[];
  proceedWithCampaign: () => void;
}) {
  const navigate = useNavigate();
  const intl = useIntl();
  const selectedGroupsData = selectedGroupIds.includes('all')
    ? []
    : groups.filter(g => selectedGroupIds.includes(g.id));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <FadeIn>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {intl.formatMessage({ id: 'common.button.back', defaultMessage: 'Back' })}
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{intl.formatMessage({ id: 'send.title', defaultMessage: 'Send Messages' })}</h1>
                <p className="text-gray-600">{intl.formatMessage({ id: 'send.subtitle', defaultMessage: 'Configure and send WhatsApp messages to contact groups' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/groups')}>
                <Settings className="h-4 w-4 mr-2" />
                {intl.formatMessage({ id: 'contacts.button.manage_groups', defaultMessage: 'Manage Groups' })}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configuration Panel */}
            <div className="lg:col-span-2 space-y-6">
              <AnimatedCard animation="slideUp" delay={0.1} className="min-h-[250px] overflow-visible">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>{intl.formatMessage({ id: 'send.config.target.title', defaultMessage: 'Target Group' })}</span>
                  </CardTitle>
                  <CardDescription>{intl.formatMessage({ id: 'send.config.target.desc', defaultMessage: 'Select which contact group will receive the message' })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">{intl.formatMessage({ id: 'send.config.target.label', defaultMessage: 'Contact Group' })}</Label>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-auto min-h-[40px] py-2"
                          >
                            <div className="flex flex-wrap gap-1 items-center">
                              {selectedGroupIds.includes('all') ? (
                                <span>{intl.formatMessage({ id: 'send.config.target.all', defaultMessage: 'All Contacts' })} ({contacts.length})</span>
                              ) : selectedGroupIds.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {selectedGroupIds.length > 3 ? (
                                    <Badge variant="secondary" className="mr-1">
                                      {selectedGroupIds.length} groups selected
                                    </Badge>
                                  ) : (
                                    groups
                                      .filter(g => selectedGroupIds.includes(g.id))
                                      .map(g => (
                                        <Badge
                                          key={g.id}
                                          variant="secondary"
                                          className="mr-1 mb-1"
                                          style={{ borderLeft: `3px solid ${g.color || '#ccc'}` }}
                                        >
                                          {g.name}
                                        </Badge>
                                      ))
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">{intl.formatMessage({ id: 'send.config.target.placeholder', defaultMessage: 'Select contact group' })}</span>
                              )}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search group..." />
                            <CommandList>
                              <CommandEmpty>No group found.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="all"
                                  onSelect={() => setSelectedGroupIds(['all'])}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedGroupIds.includes('all') ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {intl.formatMessage({ id: 'send.config.target.all', defaultMessage: 'All Contacts' })}
                                  <span className="ml-auto text-muted-foreground text-xs">
                                    {contacts.length}
                                  </span>
                                </CommandItem>
                              </CommandGroup>
                              <CommandSeparator />
                              <CommandGroup>
                                {groups.map((group) => (
                                  <CommandItem
                                    key={group.id}
                                    value={group.name}
                                    onSelect={() => {
                                      if (selectedGroupIds.includes('all')) {
                                        // If 'all' was selected, replace with this new selection
                                        setSelectedGroupIds([group.id]);
                                      } else {
                                        if (selectedGroupIds.includes(group.id)) {
                                          // Deselect
                                          const newIds = selectedGroupIds.filter(id => id !== group.id);
                                          setSelectedGroupIds(newIds.length === 0 ? ['all'] : newIds);
                                        } else {
                                          // Select
                                          setSelectedGroupIds([...selectedGroupIds, group.id]);
                                        }
                                      }
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedGroupIds.includes(group.id) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex items-center">
                                      <div
                                        className="w-3 h-3 rounded-full border mr-2"
                                        style={{ backgroundColor: group.color }}
                                      />
                                      <span>{group.name}</span>
                                    </div>
                                    <span className="ml-auto text-muted-foreground text-xs">
                                      {contacts.filter(c => c.groups && c.groups.id === group.id).length}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{intl.formatMessage({ id: 'send.config.target.summary', defaultMessage: 'Target Contacts:' })}</span>
                        <Badge variant="secondary">{targetContacts.length}</Badge>
                      </div>
                      {!selectedGroupIds.includes('all') && selectedGroupIds.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Included groups: {selectedGroupsData.map(g => g.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </AnimatedCard>

              {/* Template Selection */}
              <AnimatedCard animation="slideUp" delay={0.2}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MessageSquare className="h-5 w-5" />
                    <span>{intl.formatMessage({ id: 'send.config.template.title', defaultMessage: 'Message Template' })}</span>
                  </CardTitle>
                  <CardDescription>{intl.formatMessage({ id: 'send.config.template.desc', defaultMessage: 'Choose the message template to send' })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="template-select">{intl.formatMessage({ id: 'send.config.template.label', defaultMessage: 'Template' })}</Label>
                      <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                        <SelectTrigger>
                          <SelectValue placeholder={intl.formatMessage({ id: 'send.config.template.placeholder', defaultMessage: 'Select a template' })} />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedTemplateData && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <Label>{intl.formatMessage({ id: 'send.config.template.info', defaultMessage: 'Template Info:' })}</Label>
                          <Badge variant="secondary" className="text-xs">
                            {selectedTemplateData.variants?.length || 1} variants
                          </Badge>
                        </div>

                        <div>
                          <Label>{intl.formatMessage({ id: 'send.config.template.preview', defaultMessage: 'Random Preview:' })}</Label>
                          <div className="bg-gray-50 p-3 rounded border text-sm">
                            {previewMessage()}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {intl.formatMessage({ id: 'send.config.template.help', defaultMessage: 'ℹ️ Each message will use a random variant to avoid pattern detection' })}
                          </p>
                        </div>

                        {selectedTemplateData.variables && selectedTemplateData.variables.length > 0 && (
                          <div>
                            <Label>{intl.formatMessage({ id: 'send.config.template.variables', defaultMessage: 'Variables:' })}</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedTemplateData.variables.map((variable) => (
                                <Badge key={variable} variant="outline" className="text-xs">
                                  {variable}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </AnimatedCard>

              {/* Asset Selection */}
              <AnimatedCard animation="slideUp" delay={0.25}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Paperclip className="h-5 w-5" />
                    <span>{intl.formatMessage({ id: 'send.config.assets.title', defaultMessage: 'Attach Assets' })}</span>
                  </CardTitle>
                  <CardDescription>{intl.formatMessage({ id: 'send.config.assets.desc', defaultMessage: 'Select files to attach with your message (optional)' })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label>{intl.formatMessage({ id: 'send.config.assets.available', defaultMessage: 'Available Assets' })} ({assets.length})</Label>
                      {assets.length === 0 ? (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="flex items-center space-x-2 text-blue-700">
                            <FileImage className="h-4 w-4" />
                            <span className="text-sm">{intl.formatMessage({ id: 'send.config.assets.empty', defaultMessage: 'No assets available' })}</span>
                          </div>
                          <p className="text-xs text-blue-600 mt-1">
                            {intl.formatMessage({ id: 'send.config.assets.upload_hint', defaultMessage: 'Upload assets first in the Assets page to use them here' })}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                          {assets.map((asset) => {
                            const IconComponent = getAssetIcon(asset.category);
                            const isSelected = selectedAssets.includes(asset.id);

                            return (
                              <div
                                key={asset.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-sm ${isSelected
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                  : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                onClick={() => toggleAssetSelection(asset.id)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`p-2 rounded ${isSelected ? 'bg-primary/10' : 'bg-gray-100'
                                    }`}>
                                    <IconComponent className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-gray-600'
                                      }`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" title={asset.name}>
                                      {asset.name}
                                    </p>
                                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                                      <Badge variant="outline" className="text-xs">
                                        {asset.category}
                                      </Badge>
                                      <span>{formatFileSize(asset.file_size)}</span>
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <div className="shrink-0">
                                      <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                        <CheckCircle className="h-3 w-3 text-white" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedAssets.length > 0 && (
                      <div>
                        <Label>{intl.formatMessage({ id: 'send.config.assets.selected', defaultMessage: 'Selected Assets' })} ({selectedAssets.length}):</Label>
                        <div className="mt-2 space-y-2">
                          {getSelectedAssets().map((asset) => {
                            const IconComponent = getAssetIcon(asset.category);
                            return (
                              <div key={asset.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <IconComponent className="h-4 w-4 text-gray-600" />
                                  <div>
                                    <p className="text-sm font-medium">{asset.name}</p>
                                    <p className="text-xs text-gray-500">{formatFileSize(asset.file_size)}</p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleAssetSelection(asset.id)}
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </AnimatedCard>

              {/* Send Configuration */}
              <AnimatedCard animation="slideUp" delay={0.3}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="h-5 w-5" />
                    <span>{intl.formatMessage({ id: 'send.config.delay.title', defaultMessage: 'Send Configuration' })}</span>
                  </CardTitle>
                  <CardDescription>{intl.formatMessage({ id: 'send.config.delay.desc', defaultMessage: 'Configure timing and delivery settings' })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">{intl.formatMessage({ id: 'send.config.delay.label', defaultMessage: 'Delay Range (Dynamic)' })}</Label>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'send.mode.dynamic.desc', defaultMessage: 'Random delay between min and max range' })}</span>
                        <span className="text-sm font-medium text-primary">
                          {`${formatDelayLabel(delayRange[0])} - ${formatDelayLabel(delayRange[1] || delayRange[0])}`}
                        </span>
                      </div>

                      <Slider
                        value={[
                          PRESET_DELAYS.indexOf(delayRange[0]) !== -1 ? PRESET_DELAYS.indexOf(delayRange[0]) : 0,
                          PRESET_DELAYS.indexOf(delayRange[1]) !== -1 ? PRESET_DELAYS.indexOf(delayRange[1]) : 1
                        ]}
                        onValueChange={(vals) => {
                          setDelayRange([PRESET_DELAYS[vals[0]], PRESET_DELAYS[vals[1]]]);
                        }}
                        max={PRESET_DELAYS.length - 1}
                        min={0}
                        step={1}
                        minStepsBetweenThumbs={1}
                        showMarks={true}
                        className="mt-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{intl.formatMessage({ id: 'send.config.delay.min', defaultMessage: 'Min: 1s' })}</span>
                        <span>{intl.formatMessage({ id: 'send.config.delay.help', defaultMessage: 'Max: 15m' })}</span>
                      </div>
                    </div>

                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-yellow-800">{intl.formatMessage({ id: 'send.config.summary.title', defaultMessage: 'Send Configuration Summary:' })}</p>
                          <ul className="text-yellow-700 mt-1 space-y-1">
                            <li>• {intl.formatMessage({ id: 'send.config.summary.target', defaultMessage: 'Target: {count} contacts' }, { count: targetContacts.length })}</li>
                            <li>• {intl.formatMessage({ id: 'send.config.summary.group', defaultMessage: 'Group: {name}' }, { name: selectedGroupIds.includes('all') ? 'All Contacts' : selectedGroupData.map(g => g.name).join(', ') })}</li>
                            <li>• {intl.formatMessage({ id: 'send.config.summary.template', defaultMessage: 'Template: {name}' }, { name: selectedTemplateData?.name || 'Not selected' })}</li>
                            {selectedAssets.length > 0 && (
                              <li>• {intl.formatMessage({ id: 'send.config.summary.assets', defaultMessage: 'Assets: {count} file(s) attached' }, { count: selectedAssets.length })}</li>
                            )}
                            <li>• {intl.formatMessage({ id: 'send.config.summary.mode', defaultMessage: 'Mode: {mode}' }, { mode: intl.formatMessage({ id: 'send.mode.dynamic' }) })}</li>
                            <li>• {intl.formatMessage({ id: 'send.config.summary.delay', defaultMessage: 'Delay: {seconds}s between messages' }, { seconds: `${delayRange[0]}-${delayRange[1]}` })}</li>
                            <li>• {intl.formatMessage({ id: 'send.config.summary.time', defaultMessage: 'Estimated time: ~{minutes} minutes' }, { minutes: Math.ceil(targetContacts.length * ((delayRange[0] + delayRange[1]) / 2) / 60) })}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </AnimatedCard>
            </div>

            {/* Side Panel */}
            <div className="space-y-6">
              {/* Quota Status */}
              <AnimatedCard animation="fadeIn" delay={0.4} className="min-h-[250px]">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Zap className="h-5 w-5" />
                    <span>{intl.formatMessage({ id: 'send.quota.title', defaultMessage: 'Quota Status' })}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {quota ? (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">{intl.formatMessage({ id: 'send.quota.remaining', defaultMessage: 'Remaining:' })}</span>
                        <Badge variant={quota.remaining >= targetContacts.length ? 'default' : 'destructive'}>
                          {quota.plan_type === 'pro' ? '∞' : quota.remaining}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">{intl.formatMessage({ id: 'send.quota.required', defaultMessage: 'Required:' })}</span>
                        <Badge variant="secondary">{targetContacts.length}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">{intl.formatMessage({ id: 'send.quota.plan', defaultMessage: 'Plan:' })}</span>
                        <Badge variant="outline">{quota.plan_type}</Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      {intl.formatMessage({ id: 'common.status.loading', defaultMessage: 'Loading...' })}
                    </div>
                  )}
                </CardContent>
              </AnimatedCard>


              {/* Send Button */}
              <AnimatedCard animation="fadeIn" delay={0.5}>
                <CardContent className="pt-6">
                  <AnimatedButton
                    animation="scale"
                    className="w-full"
                    size="lg"
                    onClick={handleStartCampaign}
                    disabled={!canSend || isSending || flowState === 'validating'}
                  >
                    {isSending ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                        {intl.formatMessage({ id: 'send.button.sending', defaultMessage: 'Sending...' })}
                      </>
                    ) : flowState === 'validating' ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {intl.formatMessage({ id: 'send.button.send', defaultMessage: 'Reserve & Send' })}
                      </>
                    )}
                  </AnimatedButton>

                  {validationErrors.length > 0 && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc pl-4">
                          {validationErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {!canSend && flowState !== 'validating' && validationErrors.length === 0 && (
                    <Alert className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {!selectedTemplate ? intl.formatMessage({ id: 'send.alert.select_template', defaultMessage: 'Please select a template' }) :
                          targetContacts.length === 0 ? intl.formatMessage({ id: 'send.alert.no_contacts', defaultMessage: 'No contacts in selected group' }) :
                            quota && quota.remaining < targetContacts.length ? intl.formatMessage({ id: 'send.alert.insufficient_quota', defaultMessage: 'Insufficient quota' }) :
                              intl.formatMessage({ id: 'send.alert.complete_fields', defaultMessage: 'Complete all required fields' })}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </AnimatedCard>

              {/* Send Result */}
              {sendResult && (
                <AnimatedCard animation="fadeIn">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      {sendResult.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      )}
                      <span>{intl.formatMessage({ id: 'send.result.title', defaultMessage: 'Send Result' })}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sendResult.success ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">{intl.formatMessage({ id: 'send.result.status', defaultMessage: 'Status:' })}</span>
                          <Badge className="bg-green-600">{intl.formatMessage({ id: 'send.result.completed', defaultMessage: 'Completed' })}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">{intl.formatMessage({ id: 'send.result.total', defaultMessage: 'Total Sent:' })}</span>
                          <span className="font-medium">{sendResult.totalContacts}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">{intl.formatMessage({ id: 'send.result.success', defaultMessage: 'Successful:' })}</span>
                          <span className="font-medium text-green-600">{sendResult.successCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">{intl.formatMessage({ id: 'send.result.failed', defaultMessage: 'Failed:' })}</span>
                          <span className="font-medium text-red-600">{sendResult.failedCount}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">
                          <div>Template: {sendResult.templateName}</div>
                          <div>Group: {selectedGroupIds.includes('all')
                            ? 'All Contacts'
                            : groups.filter(g => selectedGroupIds.includes(g.id)).map(g => g.name).join(', ')}</div>
                          {sendResult.selectedAssets && sendResult.selectedAssets.length > 0 && (
                            <div>Assets: {sendResult.selectedAssets.length} file(s) attached</div>
                          )}
                          <div>Delay: {sendResult.delayRange}s</div>
                        </div>
                      </div>
                    ) : (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {sendResult.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </AnimatedCard>
              )}
            </div>
          </div>
        </FadeIn>
      </div>

      {/* Job Progress Modal */}
      {activeJobId && (
        <JobProgressModal
          jobId={activeJobId}
          open={showProgressModal}
          onClose={() => setShowProgressModal(false)}
        />
      )}

      {/* Spam Warning Modal */}
      <AlertDialog open={showSpamWarning} onOpenChange={setShowSpamWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {intl.formatMessage({ id: 'send.spam.warning.title', defaultMessage: 'Peringatan Risiko Spam' })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{intl.formatMessage({ id: 'send.spam.warning.desc', defaultMessage: 'Pengaturan pengiriman Anda berisiko terdeteksi sebagai spam oleh WhatsApp:' })}</p>
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  {spamWarningReasons.map((reason, idx) => (
                    <li key={idx} className="text-destructive">{reason}</li>
                  ))}
                </ul>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm">
                  <p className="font-medium text-yellow-800">{intl.formatMessage({ id: 'send.spam.warning.risk', defaultMessage: 'Risiko:' })}</p>
                  <ul className="text-yellow-700 mt-1 space-y-1">
                    <li>• {intl.formatMessage({ id: 'send.spam.risk.ban', defaultMessage: 'Akun WhatsApp bisa di-ban sementara atau permanen' })}</li>
                    <li>• {intl.formatMessage({ id: 'send.spam.risk.spam', defaultMessage: 'Pesan tidak terkirim atau masuk ke folder spam' })}</li>
                    <li>• {intl.formatMessage({ id: 'send.spam.risk.reputation', defaultMessage: 'Reputasi nomor telepon Anda menurun' })}</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{intl.formatMessage({ id: 'send.spam.button.cancel', defaultMessage: 'Batalkan & Ubah Pengaturan' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSpamWarning(false);
                proceedWithCampaign();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {intl.formatMessage({ id: 'send.spam.button.proceed', defaultMessage: 'Lanjutkan dengan Risiko' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);

  // New State Machine
  const [flowState, setFlowState] = useState<SendFlowState>('idle');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Spam Warning Modal State
  const [showSpamWarning, setShowSpamWarning] = useState(false);
  const [spamWarningReasons, setSpamWarningReasons] = useState<string[]>([]);

  // Safety Warning Modal State
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  // Task Conflict State
  const { canStartTask } = useBackgroundTask();
  const [showConflictModal, setShowConflictModal] = useState(false);

  const intl = useIntl();

  // Check safety warning preference on mount
  useEffect(() => {
    const hidden = localStorage.getItem('xenderin_hide_safety_warning');
    if (!hidden) {
      setShowSafetyModal(true);
    }
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current user ID
      const currentUserId = await userContextManager.getCurrentMasterUserId();
      if (!currentUserId) {
        throw new Error('User not authenticated');
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
      toast.warning('Template might be out of sync. Please refresh.');
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

  const getSelectedTemplate = () => {
    return templates.find(t => t.id === selectedTemplate);
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Check recent send volume in last 30 minutes
  const checkRecentSendVolume = async (): Promise<number> => {
    try {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const recentLogs = await historyService.getLogsByDateRange(thirtyMinsAgo, now);

      // Sum up total contacts sent in last 30 mins
      return recentLogs.reduce((sum, log) => sum + (log.total_contacts || 0), 0);
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

    const selectedTemplateData = getSelectedTemplate();

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
    const selectedTemplateData = getSelectedTemplate();

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
        toast.error('Validation failed: ' + preflight.errors[0].message);
        setFlowState('ready'); // Back to ready state to let user fix
        return;
      }

      // Additional: Ensure assets are ready (pre-download/check)
      if (selectedAssets.length > 0) {
        const assetsReady = await preflightService.ensureAssetsReady(selectedAssets);
        if (!assetsReady) {
          throw new Error('Some assets could not be prepared for sending. Please try again.');
        }
      }
    } catch (valError) {
      console.error('Preflight error:', valError);
      toast.error('Pre-flight check failed: ' + (valError instanceof Error ? valError.message : 'Unknown error'));
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
        throw new Error('WhatsApp is not connected. Please connect in Dashboard first.');
      }

      // Get current user ID
      const currentUserId = await userContextManager.getCurrentMasterUserId();
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      // 2. Reserve quota
      const reserveResult = await quotaService.reserveQuota(currentUserId, targetContacts.length);

      if (!reserveResult.success) {
        throw new Error('Failed to reserve quota');
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
      // Note: We need to pass asset paths. If AssetFile has path/url, use it.
      // If assets are stored in Supabase Storage, we might need to download them first or pass the URL.
      // For Phase 3, let's assume local paths or public URLs are sufficient if available.
      // If AssetFile doesn't have a local path, we might need to handle that.
      // Checking AssetFile type... it usually has 'url' or 'file_path'.
      // For now, let's pass the 'url' if available.
      const assetPaths = getSelectedAssets().map(a => a.url).filter(Boolean) as string[];

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
        throw new Error(result.error || 'Failed to start campaign');
      }

      // 5. Open Progress Modal
      setActiveJobId(jobId);
      setShowProgressModal(true);
      toast.success('Campaign started successfully');

    } catch (error) {
      console.error('Campaign start failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start campaign');
      setIsSending(false);
      setSendResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

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

  // Listen for job errors
  useEffect(() => {
    if (!activeJobId) return;

    const unsubscribe = window.electron.whatsapp.onJobErrorDetail((data) => {
      if (data.jobId === activeJobId) {
        console.error('Job Error Detail:', data);
        toast.error(`Failed to send to ${data.phone}: ${data.error}`);
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

          const selectedTemplateData = getSelectedTemplate();

          // Commit quota
          if (reservationId) {
            await quotaService.commitQuota(reservationId, data.success);
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
            user_id: currentUserId,
            master_user_id: currentUserId,
            contact_group_id: (selectedGroupIds.length === 1 && !selectedGroupIds.includes('all')) ? selectedGroupIds[0] : undefined,
            template_id: selectedTemplate,
            template_name: selectedTemplateData?.name || 'Unknown Template',
            total_contacts: data.total,
            success_count: data.success,
            failed_count: data.failed,
            status: 'completed',
            delay_range: delayRange[0],
            metadata: {
              jobId: activeJobId,
              logs: data.metadata?.logs || [] // Store individual message logs
            }
          });



          // Sync outbound messages to Inbox
          if (data.metadata?.logs && Array.isArray(data.metadata.logs)) {
            // Process in chunks to avoid blocking UI
            const logs = data.metadata.logs;
            const processLogs = async () => {
              const sentLogs = logs.filter((l: any) => l.status === 'sent');
              const assetsList = getSelectedAssets();
              const firstAsset = assetsList.length > 0 ? assetsList[0] : undefined;

              for (const log of sentLogs) {
                try {
                  await messageService.createOutboundMessage({
                    contact_id: log.contact_id,
                    contact_phone: log.contact_phone,
                    contact_name: log.contact_name,
                    content: log.content || selectedTemplateData?.name || 'Message Sent',
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

          // Update local quota state
          if (quota) {
            setQuota({
              ...quota,
              messages_used: quota.messages_used + data.success,
              remaining: quota.remaining - data.success
            });
          }

          setIsSending(false);
          toast.success('Campaign completed!');

          // Update result view
          setSendResult({
            success: true,
            totalContacts: data.total,
            successCount: data.success,
            failedCount: data.failed,
            templateName: selectedTemplateData?.name,
            groupName: selectedGroupIds.includes('all') ? 'All Contacts' : getSelectedGroups().map(g => g.name).join(', '),
            selectedAssets: getSelectedAssets(),
            delayRange: `${delayRange[0]}-${delayRange[1]}`,
            reservationId: reservationId
          });

        } catch (err) {
          console.error('Failed to finalize campaign:', err);
          toast.error('Campaign completed but failed to save results');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeJobId, reservationId, quota, delayRange, selectedGroupIds, selectedTemplate]);

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
