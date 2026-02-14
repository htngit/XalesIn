import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { JobProgressModal } from '@/components/ui/JobProgressModal';
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
import { Template, Quota, ContactGroup, AssetFile, ContactWithGroup } from '@/lib/services/types';

export const PRESET_DELAYS = [1, 3, 5, 10, 15, 30, 60, 120, 300, 600, 900];

export type SendFlowState = 'idle' | 'validating' | 'ready' | 'sending' | 'done' | 'error';

export const formatDelayLabel = (seconds: number) => {
    if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}m`;
    }
    return `${seconds}s`;
};

// Placeholder content component for when data is loaded
export function SendPageContent({
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
                                                                            {intl.formatMessage(
                                                                                { id: 'send.target.groups_selected', defaultMessage: '{count} groups selected' },
                                                                                { count: selectedGroupIds.length }
                                                                            )}
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
                                                        <CommandInput
                                                            placeholder={intl.formatMessage({
                                                                id: 'send.target.search_placeholder',
                                                                defaultMessage: 'Search group...'
                                                            })}
                                                        />
                                                        <CommandList>
                                                            <CommandEmpty>
                                                                {intl.formatMessage({
                                                                    id: 'send.target.empty_group',
                                                                    defaultMessage: 'No group found.'
                                                                })}
                                                            </CommandEmpty>
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
                                                    {intl.formatMessage(
                                                        { id: 'send.target.included_groups', defaultMessage: 'Included groups: {groups}' },
                                                        { groups: selectedGroupsData.map(g => g.name).join(', ') }
                                                    )}
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
                                                        {intl.formatMessage(
                                                            { id: 'send.template.variants_count', defaultMessage: '{count} variants' },
                                                            { count: selectedTemplateData.variants?.length || 1 }
                                                        )}
                                                    </Badge>
                                                </div>

                                                <div>
                                                    <Label>{intl.formatMessage({ id: 'send.config.template.preview', defaultMessage: 'Random Preview:' })}</Label>
                                                    <div className="bg-gray-50 p-3 rounded border text-sm">
                                                        {previewMessage()}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {intl.formatMessage({ id: 'send.config.template.help', defaultMessage: 'Each message will use a random variant to avoid pattern detection' })}
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
                                                        <li>• {intl.formatMessage({ id: 'send.config.summary.group', defaultMessage: 'Group: {name}' }, { name: selectedGroupIds.includes('all')
                                                            ? intl.formatMessage({ id: 'send.config.target.all', defaultMessage: 'All Contacts' })
                                                            : selectedGroupData.map(g => g.name).join(', ') })}</li>
                                                        <li>• {intl.formatMessage({ id: 'send.config.summary.template', defaultMessage: 'Template: {name}' }, { name: selectedTemplateData?.name || intl.formatMessage({ id: 'send.common.not_selected', defaultMessage: 'Not selected' }) })}</li>
                                                        {selectedAssets.length > 0 && (
                                                            <li>• {intl.formatMessage({ id: 'send.config.summary.assets', defaultMessage: 'Assets: {count} file(s) attached' }, { count: selectedAssets.length })}</li>
                                                        )}
                                                        <li>• {intl.formatMessage({ id: 'send.config.summary.mode', defaultMessage: 'Mode: {mode}' }, { mode: intl.formatMessage({ id: 'send.mode.dynamic', defaultMessage: 'Dynamic' }) })}</li>
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
                                                    {quota.plan_type === 'pro'
                                                        ? intl.formatMessage({ id: 'send.quota.unlimited', defaultMessage: 'Unlimited' })
                                                        : quota.remaining}
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
                                                {intl.formatMessage({ id: 'send.button.validating', defaultMessage: 'Validating...' })}
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
                                                    <div>
                                                        {intl.formatMessage(
                                                            { id: 'send.result.detail.template', defaultMessage: 'Template: {name}' },
                                                            { name: sendResult.templateName || intl.formatMessage({ id: 'send.common.not_selected', defaultMessage: 'Not selected' }) }
                                                        )}
                                                    </div>
                                                    <div>
                                                        {intl.formatMessage(
                                                            { id: 'send.result.detail.group', defaultMessage: 'Group: {name}' },
                                                            {
                                                                name: selectedGroupIds.includes('all')
                                                                    ? intl.formatMessage({ id: 'send.config.target.all', defaultMessage: 'All Contacts' })
                                                                    : groups.filter(g => selectedGroupIds.includes(g.id)).map(g => g.name).join(', ')
                                                            }
                                                        )}
                                                    </div>
                                                    {sendResult.selectedAssets && sendResult.selectedAssets.length > 0 && (
                                                        <div>
                                                            {intl.formatMessage(
                                                                { id: 'send.result.detail.assets', defaultMessage: 'Assets: {count} file(s) attached' },
                                                                { count: sendResult.selectedAssets.length }
                                                            )}
                                                        </div>
                                                    )}
                                                    <div>
                                                        {intl.formatMessage(
                                                            { id: 'send.result.detail.delay', defaultMessage: 'Delay: {range}s' },
                                                            { range: sendResult.delayRange }
                                                        )}
                                                    </div>
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
