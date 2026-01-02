import { useState, useEffect } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { Search, Loader2, RefreshCw, Save, Phone, Globe, Minimize2, Eye, Filter } from 'lucide-react';

interface ScrapTabProps {
    groups: ContactGroup[];
    existingContacts?: Contact[]; // Optional to avoid breaking other usages if any
    onContactsSaved: () => void;
}

export function ScrapTab({ groups, existingContacts = [], onContactsSaved }: ScrapTabProps) {
    const { contactService, groupService } = useServices();

    // State
    const [keyword, setKeyword] = useState('');
    const [limit, setLimit] = useState(50);
    const [results, setResults] = useState<ScrapedBusiness[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Scraping State
    const [isScraping, setIsScraping] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [progress, setProgress] = useState<{ total: number; current: number; message: string }>({ total: 0, current: 0, message: '' });

    // Filter State
    const [filterType, setFilterType] = useState<'all' | 'mobile' | 'landline'>('all');

    // Computed Results
    const filteredResults = results.filter(r => {
        if (!r.phone) return false;
        // Strict Mobile Rule: Only starts with +628
        // MapScraper guarantees +62 format for 0-prefixed numbers
        const isMobile = r.phone.startsWith('+628');

        if (filterType === 'mobile') return isMobile;
        if (filterType === 'landline') return !isMobile;
        return true;
    });

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

    // Listen for progress
    useEffect(() => {
        // @ts-ignore
        const unsubscribe = window.electron.mapScraping.onProgress((p: any) => {
            setProgress(p);
        });
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleScrape = async () => {
        if (!keyword.trim()) {
            toast({
                title: "Validation Error",
                description: "Please enter a keyword to search",
                variant: "destructive"
            });
            return;
        }

        try {
            // 1. Set Loading UI Immediately
            setIsScraping(true);
            setShowProgressModal(true);
            setResults([]);
            setSelectedIndices(new Set());
            setProgress({ total: limit, current: 0, message: 'Initializing scraper...' });

            // 2. Trigger Main Process
            // @ts-ignore
            const response = await window.electron.mapScraping.scrape(keyword, limit);

            if (response && response.success) {
                setResults(response.data);
                // Auto select all valid results (with phone)
                const validIndices = response.data
                    .map((r: ScrapedBusiness, idx: number) => (r.phone ? idx : -1))
                    .filter((idx: number) => idx !== -1);
                setSelectedIndices(new Set(validIndices));

                toast({
                    title: "Scraping Completed",
                    description: `Found ${response.data.length} businesses.`,
                });
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Scraping error:', error);
            toast({
                title: "Scraping Failed",
                description: error instanceof Error ? error.message : "Failed to scrape data",
                variant: "destructive"
            });
        } finally {
            // Reset states
            setIsScraping(false);
            setShowProgressModal(false);
        }
    };

    const handleCancelScrape = async () => {
        // @ts-ignore
        await window.electron.mapScraping.cancel();
        // Logic continues in finally block of handleScrape
    };

    const handleRunInBackground = () => {
        setShowProgressModal(false);
        // isScraping remains true, so the background process continues
        toast({
            title: "Running in Background",
            description: "Scraping will continue. You'll be notified when it's done.",
        });
    };

    const handleViewProgress = () => {
        setShowProgressModal(true);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // Select only visible results that are NOT existing in DB
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

    const handleSave = async () => {
        if (selectedIndices.size === 0) return;

        if (targetGroupId === 'new' && !newGroupName.trim()) {
            toast({
                title: "Validation Error",
                description: "Please enter a name for the new group",
                variant: "destructive"
            });
            return;
        }

        try {
            setIsSaving(true);
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
            const contactsToSave = Array.from(selectedIndices)
                .filter(idx => filteredResults.some(r => results.indexOf(r) === idx))
                .map(idx => {
                    const item = results[idx];
                    return {
                        name: item.name,
                        phone: item.phone,
                        group_id: groupId,
                        tags: ['scraped', 'bing-maps'], // Default tags
                        notes: `Address: ${item.address}\nWebsite: ${item.website || '-'}\nCategory: ${item.category || '-'}`,
                        is_blocked: false
                    };
                });

            // Save contacts in bulk for better atomicity
            const result = await contactService.createContacts(contactsToSave);
            const successCount = result.created;

            toast({
                title: "Success",
                description: `Saved ${successCount} contacts successfully.`,
            });

            // Reset
            setResults([]);
            setSelectedIndices(new Set());
            setKeyword('');

            // Small delay to allow IndexedDB to finalize writes before parent reloads
            await new Promise(resolve => setTimeout(resolve, 200));
            onContactsSaved();

        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: "Save Failed",
                description: "Failed to save contacts.",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Background Scraping Banner */}
            {isScraping && !showProgressModal && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-blue-900">Scraping in progress...</h4>
                            <p className="text-sm text-blue-700">{progress.message} ({progress.current}/{progress.total})</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleViewProgress}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                    </Button>
                </div>
            )}

            <AnimatedCard animation="fadeIn">
                <CardHeader>
                    <CardTitle>Map Scraping (Bing Maps)</CardTitle>
                    <CardDescription>
                        Search for businesses on Bing Maps and extract contact information.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-sm font-medium">Search Keyword</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="e.g. Restoran Jakarta Selatan"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isScraping && handleScrape()}
                                    disabled={isScraping}
                                />
                            </div>
                        </div>

                        <div className="w-full md:w-32 space-y-2">
                            <label className="text-sm font-medium">Max Results</label>
                            <Select
                                value={limit.toString()}
                                onValueChange={(v) => setLimit(parseInt(v))}
                                disabled={isScraping}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Limit" />
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
                                    Scraping...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Start Scraping
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </AnimatedCard>

            {/* Results Section */}
            {results.length > 0 && (
                <AnimatedCard animation="slideUp" delay={0.1}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Scraped Results ({filteredResults.length})</CardTitle>
                            <CardDescription>Select contacts to save</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                                <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
                                <Select value={filterType} onValueChange={(v: any) => {
                                    setFilterType(v);
                                    setSelectedIndices(new Set()); // Reset selection on filter change
                                }}>
                                    <SelectTrigger className="w-[140px] h-9 border-none bg-transparent shadow-none">
                                        <SelectValue placeholder="Filter" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Numbers</SelectItem>
                                        <SelectItem value="mobile">Mobile Only</SelectItem>
                                        <SelectItem value="landline">Landline Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                                <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                                    <SelectTrigger className="w-[180px] h-9">
                                        <SelectValue placeholder="Select Group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">+ Create New Group</SelectItem>
                                        {groups.map(g => (
                                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {targetGroupId === 'new' && (
                                    <Input
                                        placeholder="Group Name"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        className="w-[180px] h-9"
                                    />
                                )}
                            </div>

                            <Button onClick={handleSave} disabled={isSaving || selectedIndices.size === 0}>
                                {isSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Selected ({selectedIndices.size})
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
                                        <TableHead>Business Name</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Website</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResults.map((item) => {
                                        const index = results.indexOf(item); // Get original index for selection
                                        const isExisting = isContactExists(item.phone);
                                        const isRowDisabled = !item.phone || isExisting;

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
                                                    {isExisting && <span className="block text-[10px] text-red-500 font-semibold">(Already Saved)</span>}
                                                </TableCell>
                                                <TableCell>
                                                    {item.phone ? (
                                                        <div className={`flex items-center ${isExisting ? 'text-red-500' : 'text-green-600'}`}>
                                                            <Phone className="mr-2 h-3 w-3" />
                                                            {item.phone}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs italic">No phone</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="max-w-[300px] truncate text-xs" title={item.address}>{item.address}</TableCell>
                                                <TableCell>
                                                    {item.website && (
                                                        <a href={item.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center">
                                                            <Globe className="mr-1 h-3 w-3" />
                                                            Link
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
                        <DialogTitle>Scraping in progress...</DialogTitle>
                        <DialogDescription>
                            {progress.message || "Please wait..."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Progress value={(progress.current / progress.total) * 100} />
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span className="animate-pulse">{progress.message}</span>
                            <span>{progress.current} / {progress.total}</span>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleRunInBackground}>
                            <Minimize2 className="mr-2 h-4 w-4" />
                            Run in Background
                        </Button>
                        <Button variant="destructive" onClick={handleCancelScrape}>Cancel</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
