import { useLocale } from '@/lib/i18n/IntlProvider';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, ChevronDown } from 'lucide-react';

interface LanguageSwitcherProps {
    className?: string;
    showLabel?: boolean;
}

export function LanguageSwitcher({ className, showLabel = false }: LanguageSwitcherProps) {
    const { locale, setLocale } = useLocale();

    const getLanguageName = (code: string) => {
        switch (code) {
            case 'id': return 'Bahasa Indonesia';
            case 'en': return 'English';
            default: return 'English';
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={showLabel ? "outline" : "ghost"}
                    size={showLabel ? "default" : "icon"}
                    className={className}
                >
                    <Globe className={`h-[1.2rem] w-[1.2rem] ${showLabel ? 'mr-2' : ''}`} />
                    {showLabel ? (
                        <>
                            <span>{getLanguageName(locale)}</span>
                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                        </>
                    ) : (
                        <span className="sr-only">Switch language</span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocale('en')} className={locale === 'en' ? 'bg-accent' : ''}>
                    <span className="mr-2">🇺🇸</span> English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale('id')} className={locale === 'id' ? 'bg-accent' : ''}>
                    <span className="mr-2">🇮🇩</span> Indonesia
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
