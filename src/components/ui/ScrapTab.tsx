import { useState, useMemo } from 'react';
import { useServices } from '@/lib/services/ServiceContext';
import { ContactGroup, Contact } from '@/lib/services/types';
import { ScrapedBusiness } from '@/types/scraping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AnimatedCard } from '@/components/ui/animated-card';
import { toast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from '@/components/ui/progress';
import { Search, Loader2, RefreshCw, Save, Phone, Globe, Minimize2, Eye, Filter } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { DataCleaningModal } from './DataCleaningModal';
import { useScraping } from '@/contexts/ScrapingContext';
import { useBackgroundTask } from '@/contexts/BackgroundTaskContext';

interface ScrapTabProps {
    groups: ContactGroup[];
    existingContacts?: Contact[]; // Optional to avoid breaking other usages if any
    onContactsSaved: () => void;
}

export function ScrapTab({ groups, existingContacts = [], onContactsSaved }: ScrapTabProps) {
    const intl = useIntl();
    const { contactService, groupService } = useServices();

    // Global Scraping State
    const {
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
    } = useScraping();

    // Local UI State
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [showProgressModal, setShowProgressModal] = useState(false);

    // Filter State
    const [filterType, setFilterType] = useState<'all' | 'mobile' | 'landline'>('all');

    // Google Maps Warning State
    const [showGoogleWarning, setShowGoogleWarning] = useState(false);

    // Task Conflict State
    const { canStartTask } = useBackgroundTask();
    const [showConflictModal, setShowConflictModal] = useState(false);

    const handlePlatformChange = (newPlatform: 'bing' | 'google') => {
        if (newPlatform === 'google') {
            setShowGoogleWarning(true);
        } else {
            setPlatform(newPlatform);
        }
    };

    const confirmGooglePlatform = () => {
        setPlatform('google');
        setShowGoogleWarning(false);
    };

    // Computed Results
    const filteredResults = useMemo(() => results.filter(r => {
        if (!r.phone) return false;
        const isMobile = r.phone.startsWith('+628');
        if (filterType === 'mobile') return isMobile;
        if (filterType === 'landline') return !isMobile;
        return true;
    }), [results, filterType]);

    // Existing Contacts Map (normalize keys)
    const existingPhoneSet = useMemo(() => {
        const set = new Set<string>();
        existingContacts?.forEach(c => {
            if (c.phone) set.add(c.phone.replace(/[^\d]/g, ''));
        });
        return set;
    }, [existingContacts]);

    // Check availability helper
    const isContactExists = (phone: string) => {
        if (!phone) return false;
        const normalized = phone.replace(/[^\d]/g, '');
        return existingPhoneSet.has(normalized);
    };

    // Saving State
    const [targetGroupId, setTargetGroupId] = useState<string>('new');
    const [newGroupName, setNewGroupName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Data Cleaning State
    const [showCleaningModal, setShowCleaningModal] = useState(false);
    const [duplicates, setDuplicates] = useState<{ scraped: ScrapedBusiness; existing: Contact }[]>([]);

    // Listen for progress - REMOVED (Handled in Context)
    /* 
    useEffect(() => { ... }, []); 
    */

    const handleCancelScrape = async () => {
        setShowProgressModal(false);
        await stopScraping();
    };

    const handleRunInBackground = () => {
        setShowProgressModal(false);
        toast({
            title: intl.formatMessage({ id: 'scraping.notification.background' }),
            description: intl.formatMessage({ id: 'scraping.notification.background_desc' }),
        });
    };

    const handleViewProgress = () => {
        setShowProgressModal(true);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const validIndices = filteredResults
                .filter(r => !isContactExists(r.phone))
                .map(item => results.indexOf(item));
            setSelectedIndices(new Set(validIndices));
        } else {
            setSelectedIndices(new Set());
        }
    };

    const handleSelectRow = (index: number, checked: boolean) => {
        const newSet = new Set(selectedIndices);
        if (checked) newSet.add(index);
        else newSet.delete(index);
        setSelectedIndices(newSet);
    };

    const handleScrape = async () => {
        if (!keyword.trim()) {
            toast({
                title: intl.formatMessage({ id: 'common.validation_error' }),
                description: intl.formatMessage({ id: 'scraping.notification.validation_keyword' }),
                variant: "destructive"
            });
            return;
        }

        // Check for task conflict
        if (!canStartTask('scraping')) {
            setShowConflictModal(true);
            return;
        }

        // Start Scraping via Context
        setShowProgressModal(true);
        setSelectedIndices(new Set()); // Reset selection

        await startScraping(keyword, limit, platform);
    };

    const handleSave = async () => {
        if (selectedIndices.size === 0) return;

        // Detect duplicates before saving
        const potentialDuplicates: { scraped: ScrapedBusiness; existing: Contact }[] = [];
        const indicesToProcess = Array.from(selectedIndices);

        indicesToProcess.forEach(idx => {
            const item = results[idx];
            if (item.phone) {
                const normalized = item.phone.replace(/[^\d]/g, '');
                // Find existing contact with same phone
                const existing = existingContacts.find(c => c.phone?.replace(/[^\d]/g, '') === normalized);
                if (existing) {
                    potentialDuplicates.push({ scraped: item, existing });
                }
            }
        });

        if (potentialDuplicates.length > 0) {
            setDuplicates(potentialDuplicates);
            setShowCleaningModal(true);
            return;
        }

        // If no duplicates, proceed to save directly
        await executeSave(selectedIndices);
    };

    const handleCleaningResolve = async (resolutions: Map<string, 'skip' | 'merge_scraped' | 'merge_existing' | 'replace'>) => {
        setShowCleaningModal(false);


        // We need to handle updates for replace/merge logic differently than create
        // For MVP, we will only create NEW contacts from the non-duplicate ones
        // and handle the "replace" actions.
        // Complex merging logic typically requires individual update calls.

        // 1. Identify which selected indices trigger a resolution action
        const updates: { contactId: string; data: Partial<Contact> }[] = [];
        const indicesKeep = new Set<number>();
        const indicesSkip = new Set<number>();

        results.forEach((r, idx) => {
            if (!selectedIndices.has(idx)) return;
            const key = r.phone; // Consistent key with modal
            const resolution = resolutions.get(key);

            if (resolution === 'skip') {
                indicesSkip.add(idx);
            } else if (resolution === 'replace' || resolution === 'merge_scraped') {
                // If replace/merge_scraped, we ideally update the EXISTING contact
                // Find existing
                const normalized = r.phone.replace(/[^\d]/g, '');
                const existing = existingContacts.find(c => c.phone?.replace(/[^\d]/g, '') === normalized);

                if (existing && existing.id) {
                    updates.push({
                        contactId: existing.id,
                        data: {
                            name: r.name, // Use scraped name
                            // Address/Notes could be appended/merged if desired
                            notes: `Address: ${r.address}\nUpdated via Scraping`,
                        }
                    });
                    // We processed this as an update, so don't "create" it again
                    indicesSkip.add(idx);
                }
            } else if (resolution === 'merge_existing') {
                // Keep existing name, maybe update other fields? 
                // For now, treat as skip since we keep existing data
                indicesSkip.add(idx);
            } else {
                // No resolution needed (not a duplicate), keep for creation
                indicesKeep.add(idx);
            }
        });

        // Execute Batch Updates
        if (updates.length > 0) {
            // Service doesn't have bulkUpdate yet, loop for now (or implemented in service?)
            // Assuming we must loop or add bulkUpdateService
            // For MVP: looping update
            await Promise.all(updates.map(u => contactService.updateContact(u.contactId, u.data)));
            toast({
                title: intl.formatMessage({ id: 'common.success' }),
                description: `Updated ${updates.length} existing contacts.`,
            });
        }

        // Execute Batch Creates for non-duplicates
        // Filter out the ones we decided to skip or already updated
        const indicesToCreate = new Set(
            Array.from(selectedIndices).filter(idx => !indicesSkip.has(idx))
        );

        if (indicesToCreate.size > 0) {
            await executeSave(indicesToCreate);
        } else if (updates.length === 0 && indicesSkip.size > 0) {
            toast({
                title: intl.formatMessage({ id: 'common.info' }),
                description: "All selected items were skipped or merged.",
            });
        }
    };

    const executeSave = async (indices: Set<number>) => {
        if (targetGroupId === 'new' && !newGroupName.trim()) {
            toast({
                title: intl.formatMessage({ id: 'common.validation_error' }),
                description: intl.formatMessage({ id: 'scraping.notification.validation_group' }),
                variant: "destructive"
            });
            return;
        }

        setIsSaving(true);
        try {
            let groupId = targetGroupId;

            // Create group if new
            if (targetGroupId === 'new') {
                const newGroup = await groupService.createGroup({
                    name: newGroupName,
                    color: '#10b981', // Default green
                    description: 'Created from Map Scraping'
                });
                if (!newGroup) throw new Error("Failed to create group");
                groupId = newGroup.id;
            }

            // Convert scraped data to contacts (use filtered results)
            const contactsToSave = Array.from(indices)
                .map(idx => {
                    const item = results[idx];
                    return {
                        name: item.name,
                        phone: item.phone,
                        group_id: groupId,
                        tags: ['scraped', `maps-${platform}`],
                        notes: `Address: ${item.address}\nWebsite: ${item.website || '-'}\nCategory: ${item.category || '-'}`,
                        is_blocked: false
                    };
                });

            // Save contacts in bulk for better atomicity
            const result = await contactService.createContacts(contactsToSave);
            const successCount = result.created;

            toast({
                title: intl.formatMessage({ id: 'common.success' }),
                description: intl.formatMessage({ id: 'scraping.notification.save_success' }, { count: successCount }),
            });

            // Reset (Context)
            clearResults();
            setSelectedIndices(new Set());
            setKeyword('');
            setDuplicates([]);

            // Small delay to allow IndexedDB to finalize writes before parent reloads
            await new Promise(resolve => setTimeout(resolve, 200));
            onContactsSaved();

        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: intl.formatMessage({ id: 'common.error' }),
                description: intl.formatMessage({ id: 'scraping.notification.save_failed' }),
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <DataCleaningModal
                isOpen={showCleaningModal}
                onClose={() => setShowCleaningModal(false)}
                duplicates={duplicates}
                onResolve={handleCleaningResolve}
            />

            {/* Google Maps Warning Modal */}
            <AlertDialog open={showGoogleWarning} onOpenChange={setShowGoogleWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle><FormattedMessage id="scraping.warning.google_maps_title" defaultMessage="Google Maps Scraping Warning" /></AlertDialogTitle>
                        <AlertDialogDescription>
                            <FormattedMessage id="scraping.warning.google_maps_desc" defaultMessage="Scraping Google Maps takes longer but provides more accurate results." />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={confirmGooglePlatform}><FormattedMessage id="scraping.warning.google_maps_confirm" defaultMessage="Continue" /></AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Background Scraping Banner */}
            {isScraping && !showProgressModal && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-blue-900"><FormattedMessage id="scraping.banner.progress" defaultMessage="Scraping in progress..." /></h4>
                            <p className="text-sm text-blue-700">{progress.message} ({progress.current}/{progress.total})</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleViewProgress}>
                        <Eye className="mr-2 h-4 w-4" />
                        <FormattedMessage id="scraping.banner.view" defaultMessage="View" />
                    </Button>
                </div>
            )}

            <AnimatedCard animation="fadeIn">
                <CardHeader>
                    <CardTitle><FormattedMessage id="scraping.title" defaultMessage="Map Scraping" /></CardTitle>
                    <CardDescription>
                        <FormattedMessage id="scraping.description" defaultMessage="Search for businesses on maps and extract contact information." />
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        {/* Platform Selector */}
                        <div className="w-full md:w-32 space-y-2">
                            <label className="text-sm font-medium"><FormattedMessage id="scraping.platform.label" defaultMessage="Platform" /></label>
                            <Select
                                value={platform}
                                onValueChange={(v: 'bing' | 'google') => handlePlatformChange(v)}
                                disabled={isScraping}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bing">Bing Maps</SelectItem>
                                    <SelectItem value="google">Google Maps</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-sm font-medium"><FormattedMessage id="scraping.keyword.label" defaultMessage="Search Keyword" /></label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={intl.formatMessage({ id: 'scraping.keyword.placeholder', defaultMessage: 'e.g. Restoran Jakarta Selatan' })}
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isScraping && handleScrape()}
                                    disabled={isScraping}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-32 space-y-2">
                            <label className="text-sm font-medium"><FormattedMessage id="scraping.limit.label" defaultMessage="Max Results" /></label>
                            <Select
                                value={limit.toString()}
                                onValueChange={(v) => setLimit(parseInt(v))}
                                disabled={isScraping}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={intl.formatMessage({ id: 'scraping.limit.placeholder', defaultMessage: 'Limit' })} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            onClick={handleScrape}
                            className="w-full md:w-auto"
                            disabled={isScraping || !keyword.trim()}
                        >
                            {isScraping ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    <FormattedMessage id="scraping.button.scraping" defaultMessage="Scraping..." />
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    <FormattedMessage id="scraping.button.start" defaultMessage="Start Scraping" />
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </AnimatedCard>

            {/* Results Section */}
            {results.length > 0 && (
                <AnimatedCard animation="slideUp" delay={0.1}>
                    <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle><FormattedMessage id="scraping.results.title" defaultMessage="Scraped Results ({count})" values={{ count: filteredResults.length }} /></CardTitle>
                            <CardDescription><FormattedMessage id="scraping.results.description" defaultMessage="Select contacts to save" /></CardDescription>
                        </div>
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                                <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
                                <Select value={filterType} onValueChange={(v: any) => {
                                    setFilterType(v);
                                    setSelectedIndices(new Set()); // Reset selection on filter change
                                }}>
                                    <SelectTrigger className="w-[140px] h-9 border-none bg-transparent shadow-none">
                                        <SelectValue placeholder={intl.formatMessage({ id: 'scraping.filter.placeholder', defaultMessage: 'Filter' })} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all"><FormattedMessage id="scraping.filter.all" defaultMessage="All Numbers" /></SelectItem>
                                        <SelectItem value="mobile"><FormattedMessage id="scraping.filter.mobile" defaultMessage="Mobile Only" /></SelectItem>
                                        <SelectItem value="landline"><FormattedMessage id="scraping.filter.landline" defaultMessage="Landline Only" /></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                                <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                                    <SelectTrigger className="w-[180px] h-9">
                                        <SelectValue placeholder={intl.formatMessage({ id: 'scraping.group.select', defaultMessage: 'Select Group' })} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new"><FormattedMessage id="scraping.group.new" defaultMessage="+ Create New Group" /></SelectItem>
                                        {groups.map(g => (
                                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {targetGroupId === 'new' && (
                                    <Input
                                        placeholder={intl.formatMessage({ id: 'scraping.group.name_placeholder', defaultMessage: 'Group Name' })}
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        className="w-[150px] h-9"
                                    />
                                )}
                            </div>

                            <Button onClick={handleSave} disabled={isSaving || selectedIndices.size === 0}>
                                {isSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                <FormattedMessage id="scraping.button.save" defaultMessage="Save Selected ({count})" values={{ count: selectedIndices.size }} />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedIndices.size === filteredResults.length && filteredResults.length > 0}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead><FormattedMessage id="scraping.table.name" defaultMessage="Business Name" /></TableHead>
                                        <TableHead><FormattedMessage id="scraping.table.phone" defaultMessage="Phone" /></TableHead>
                                        <TableHead><FormattedMessage id="scraping.table.address" defaultMessage="Address" /></TableHead>
                                        <TableHead><FormattedMessage id="scraping.table.website" defaultMessage="Website" /></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResults.map((item) => {
                                        const index = results.indexOf(item); // Get original index for selection
                                        const isExisting = isContactExists(item.phone);
                                        const isRowDisabled = !item.phone;
                                        // Note: We ALLOW selecting existing contacts now, because we have Duplicate Resolution flow
                                        // So only disable if no phone

                                        return (
                                            <TableRow key={index} className={isRowDisabled ? 'opacity-50 bg-muted/30' : ''}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedIndices.has(index)}
                                                        onCheckedChange={(c) => {
                                                            if (!isRowDisabled) handleSelectRow(index, c as boolean)
                                                        }}
                                                        disabled={isRowDisabled}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium text-xs">
                                                    {item.name}
                                                    {isExisting && <span className="block text-[10px] text-yellow-600 font-semibold flex items-center gap-1">
                                                        <RefreshCw className="w-3 h-3" /> Potential Duplicate
                                                    </span>}
                                                </TableCell>
                                                <TableCell>
                                                    {item.phone ? (
                                                        <div className={`flex items-center ${isExisting ? 'text-yellow-600' : 'text-green-600'}`}>
                                                            <Phone className="mr-2 h-3 w-3" />
                                                            {item.phone}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs italic"><FormattedMessage id="scraping.table.no_phone" defaultMessage="No phone" /></span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="max-w-[300px] truncate text-xs" title={item.address}>{item.address}</TableCell>
                                                <TableCell>
                                                    {item.website && (
                                                        <a href={item.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center">
                                                            <Globe className="mr-1 h-3 w-3" />
                                                            <FormattedMessage id="scraping.table.link" defaultMessage="Link" />
                                                        </a>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </AnimatedCard>
            )}

            {/* Progress Dialog */}
            <Dialog open={showProgressModal} onOpenChange={(open) => !open && handleRunInBackground()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle><FormattedMessage id="scraping.dialog.title" defaultMessage="Scraping in progress..." /></DialogTitle>
                        <DialogDescription>
                            {progress.message || intl.formatMessage({ id: 'scraping.dialog.wait', defaultMessage: 'Please wait...' })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Progress value={(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)} />
                        {/* Avoid division by zero */}
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span className="animate-pulse">{progress.message}</span>
                            <span>{progress.current} / {progress.total}</span>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleRunInBackground}>
                            <Minimize2 className="mr-2 h-4 w-4" />
                            <FormattedMessage id="scraping.dialog.background" defaultMessage="Run in Background" />
                        </Button>
                        <Button variant="destructive" onClick={handleCancelScrape}><FormattedMessage id="common.button.cancel" defaultMessage="Cancel" /></Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Task Conflict Modal */}
            <AlertDialog open={showConflictModal} onOpenChange={setShowConflictModal}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            <FormattedMessage id="background.conflict.title" defaultMessage="Task Already Running" />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <FormattedMessage
                                id="background.conflict.campaign"
                                defaultMessage="A campaign is currently in progress. Please wait for it to complete or stop it before starting scraping."
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setShowConflictModal(false)}>
                            <FormattedMessage id="background.conflict.dismiss" defaultMessage="Got it" />
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
