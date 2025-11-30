import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Pause, Play } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

interface JobProgressModalProps {
    jobId: string;
    open: boolean;
    onClose: () => void;
}

interface JobProgressData {
    jobId: string;
    processed: number;
    total: number;
    success: number;
    failed: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
}

export function JobProgressModal({ jobId, open, onClose }: JobProgressModalProps) {
    const [progress, setProgress] = useState<JobProgressData>({
        jobId,
        processed: 0,
        total: 0,
        success: 0,
        failed: 0,
        status: 'pending'
    });

    useEffect(() => {
        if (!jobId) return;

        // Reset progress when jobId changes
        setProgress({
            jobId,
            processed: 0,
            total: 0,
            success: 0,
            failed: 0,
            status: 'pending'
        });

        const unsubscribe = window.electron.whatsapp.onJobProgress((data) => {
            if (data.jobId === jobId) {
                setProgress(data);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [jobId]);

    const handlePause = async () => {
        await window.electron.whatsapp.pauseJob(jobId);
    };

    const handleResume = async () => {
        await window.electron.whatsapp.resumeJob(jobId);
    };

    const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            // Prevent closing if processing, unless completed or failed
            if (!isOpen && (progress.status === 'completed' || progress.status === 'failed')) {
                onClose();
            } else if (!isOpen) {
                // Optional: Confirm stop/close? For now, just allow close but job continues in background
                onClose();
            }
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        <FormattedMessage id="campaign.progress.title" defaultMessage="Campaign Progress" />
                    </DialogTitle>
                    <DialogDescription>
                        <FormattedMessage id="campaign.progress.description" defaultMessage="Sending messages..." />
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>
                                {progress.status === 'processing' && <FormattedMessage id="common.status.processing" defaultMessage="Processing..." />}
                                {progress.status === 'paused' && <FormattedMessage id="common.status.paused" defaultMessage="Paused" />}
                                {progress.status === 'completed' && <FormattedMessage id="common.status.completed" defaultMessage="Completed" />}
                                {progress.status === 'failed' && <FormattedMessage id="common.status.failed" defaultMessage="Failed" />}
                                {progress.status === 'pending' && <FormattedMessage id="common.status.pending" defaultMessage="Pending..." />}
                            </span>
                            <span className="text-muted-foreground">{Math.round(percentage)}%</span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-slate-50 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-slate-700">{progress.processed}/{progress.total}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Processed</p>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{progress.success}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Success</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg">
                            <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Failed</p>
                        </div>
                    </div>

                    <div className="flex justify-center gap-3 pt-2">
                        {progress.status === 'processing' && (
                            <Button onClick={handlePause} variant="outline" className="gap-2">
                                <Pause className="h-4 w-4" />
                                <FormattedMessage id="common.button.pause" defaultMessage="Pause" />
                            </Button>
                        )}
                        {progress.status === 'paused' && (
                            <Button onClick={handleResume} variant="default" className="gap-2">
                                <Play className="h-4 w-4" />
                                <FormattedMessage id="common.button.resume" defaultMessage="Resume" />
                            </Button>
                        )}
                        {(progress.status === 'completed' || progress.status === 'failed') && (
                            <Button onClick={onClose} variant="outline" className="gap-2">
                                <FormattedMessage id="common.button.close" defaultMessage="Close" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
