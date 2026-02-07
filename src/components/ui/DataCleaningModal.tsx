import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './button';
import { ScrapedBusiness } from '@/types/scraping';
import { Contact } from '@/lib/services/types';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface DuplicateMatch {
    scraped: ScrapedBusiness;
    existing: Contact;
}

interface DataCleaningModalProps {
    isOpen: boolean;
    onClose: () => void;
    duplicates: DuplicateMatch[];
    onResolve: (resolutions: Map<string, 'skip' | 'merge_scraped' | 'merge_existing' | 'replace'>) => void;
}

export const DataCleaningModal: React.FC<DataCleaningModalProps> = ({
    isOpen,
    onClose,
    duplicates,
    onResolve
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [resolutions, setResolutions] = useState<Map<string, 'skip' | 'merge_scraped' | 'merge_existing' | 'replace'>>(new Map());

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setResolutions(new Map());
        }
    }, [isOpen]);

    const currentMatch = duplicates[currentIndex];

    const handleAction = (action: 'skip' | 'merge_scraped' | 'merge_existing' | 'replace') => {
        const newResolutions = new Map(resolutions);
        // Use phone as key since we match by phone
        if (currentMatch) {
            newResolutions.set(currentMatch.scraped.phone, action);
            setResolutions(newResolutions);

            if (currentIndex < duplicates.length - 1) {
                setCurrentIndex(currentIndex + 1);
            }
        }
    };

    const handleSkipAll = () => {
        const newResolutions = new Map(resolutions);
        for (let i = currentIndex; i < duplicates.length; i++) {
            const match = duplicates[i];
            newResolutions.set(match.scraped.phone, 'skip');
        }
        setResolutions(newResolutions);
        onResolve(newResolutions);
    };

    const handleReplaceAll = () => {
        const newResolutions = new Map(resolutions);
        for (let i = currentIndex; i < duplicates.length; i++) {
            const match = duplicates[i];
            newResolutions.set(match.scraped.phone, 'replace');
        }
        setResolutions(newResolutions);
        onResolve(newResolutions);
    };

    const handleFinish = () => {
        onResolve(resolutions);
    };

    if (!currentMatch) return null;


    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Data Cleaning - {duplicates.length} Duplicates Found</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm text-muted-foreground">
                            Resolving conflict {currentIndex + 1} of {duplicates.length}
                        </span>
                        <div className="space-x-2">
                            <Button variant="outline" size="sm" onClick={handleSkipAll}>Skip Remaining</Button>
                            <Button variant="outline" size="sm" onClick={handleReplaceAll}>Replace Remaining</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border rounded-lg p-4">
                        {/* Existing Contact */}
                        <div className="space-y-3 bg-muted/20 p-4 rounded border">
                            <h3 className="font-semibold text-lg border-b pb-2">Existing Contact</h3>
                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="font-medium text-muted-foreground">Name:</span>
                                <span>{currentMatch.existing.name}</span>

                                <span className="font-medium text-muted-foreground">Phone:</span>
                                <span className="font-mono">{currentMatch.existing.phone}</span>

                                <span className="font-medium text-muted-foreground">Group:</span>
                                <span>{currentMatch.existing.group_id /* Ideally resolve group name */ || 'Unknown'}</span>
                            </div>
                        </div>

                        {/* Scraped Business */}
                        <div className="space-y-3 bg-blue-50/20 p-4 rounded border border-blue-200/50">
                            <h3 className="font-semibold text-lg border-b pb-2 text-blue-600">New (Scraped)</h3>
                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="font-medium text-muted-foreground">Name:</span>
                                <span>{currentMatch.scraped.name}</span>

                                <span className="font-medium text-muted-foreground">Phone:</span>
                                <span className="font-mono">{currentMatch.scraped.phone}</span>

                                <span className="font-medium text-muted-foreground">Address:</span>
                                <span>{currentMatch.scraped.address}</span>

                                <span className="font-medium text-muted-foreground">Category:</span>
                                <span>{currentMatch.scraped.category}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between items-center border-t pt-4">
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)}
                            disabled={currentIndex === 0}
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    </div>

                    <div className="flex gap-2 flex-wrap justify-center">
                        <Button variant="outline" onClick={() => handleAction('skip')}>
                            Skip (Keep Existing)
                        </Button>

                        <Button variant="outline" onClick={() => handleAction('merge_existing')}>
                            Merge ← (Keep Name)
                        </Button>

                        <Button variant="outline" onClick={() => handleAction('merge_scraped')}>
                            Merge → (Use New Name)
                        </Button>

                        <Button variant="destructive" onClick={() => handleAction('replace')}>
                            Replace (Overwrite)
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        {currentIndex === duplicates.length - 1 && (
                            <Button onClick={handleFinish} className="bg-green-600 hover:bg-green-700">
                                Save All
                            </Button>
                        )}
                        {currentIndex < duplicates.length - 1 && (
                            <Button variant="ghost" onClick={() => setCurrentIndex(currentIndex + 1)}>
                                Next <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
