import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { Skeleton } from './skeleton';
import { Sparkles, RefreshCw, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function GeminiCard() {
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const webviewRef = useRef<any>(null);

    const handleRefresh = () => {
        if (webviewRef.current) {
            setIsLoading(true);
            webviewRef.current.reload();
        }
    };

    const handleExternalLink = () => {
        window.open('https://gemini.google.com/', '_blank');
    };

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const stopLoading = () => setIsLoading(false);
        const startLoading = () => setIsLoading(true);

        webview.addEventListener('did-stop-loading', stopLoading);
        webview.addEventListener('did-start-loading', startLoading);

        return () => {
            webview.removeEventListener('did-stop-loading', stopLoading);
            webview.removeEventListener('did-start-loading', startLoading);
        };
    }, []);

    return (
        <Card className={cn(
            "transition-all duration-500 ease-in-out border-primary/20 bg-white/50 backdrop-blur-sm overflow-hidden group",
            isExpanded ? "fixed inset-4 z-50 h-[calc(100vh-32px)]" : "relative w-full"
        )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 border-b">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-lg shadow-blue-500/20">
                        <Sparkles className="h-5 w-5 text-white animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                Google Gemini
                            </CardTitle>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">AI Assistant</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Your intelligent workspace companion</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={handleRefresh} className="h-8 w-8 text-muted-foreground hover:text-blue-600">
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-8 w-8 text-muted-foreground hover:text-purple-600">
                        {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleExternalLink} className="h-8 w-8 text-muted-foreground hover:text-pink-600">
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className={cn(
                "p-0 relative bg-gray-50/50",
                isExpanded ? "h-[calc(100%-80px)]" : "h-[600px]"
            )}>
                {isLoading && (
                    <div className="absolute inset-0 z-10 bg-white/80 p-8">
                        <div className="space-y-4">
                            <Skeleton className="h-12 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <div className="pt-8 space-y-4">
                                <Skeleton className="h-32 w-full" />
                                <Skeleton className="h-32 w-full" />
                            </div>
                        </div>
                    </div>
                )}

                <webview
                    ref={webviewRef}
                    src="https://gemini.google.com/"
                    className="w-full h-full"
                    allowpopups={true}
                />
            </CardContent>
        </Card>
    );
}
