import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Smartphone } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { toast } from 'sonner';

export function SyncPreferencesCard() {
    const intl = useIntl();
    const [autoSyncContacts, setAutoSyncContacts] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('autoSyncContacts');
        // Default to true if not set
        if (saved === 'false') {
            setAutoSyncContacts(false);
        } else {
            setAutoSyncContacts(true);
        }
    }, []);

    const handleToggleContacts = (checked: boolean) => {
        setAutoSyncContacts(checked);
        localStorage.setItem('autoSyncContacts', String(checked));

        toast.info(
            checked
                ? intl.formatMessage({ id: 'settings.sync.contacts_enabled', defaultMessage: 'Contact auto-sync enabled' })
                : intl.formatMessage({ id: 'settings.sync.contacts_disabled', defaultMessage: 'Contact auto-sync disabled' })
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    <FormattedMessage id="settings.sync.preferences.title" defaultMessage="Sync Preferences" />
                </CardTitle>
                <CardDescription>
                    <FormattedMessage id="settings.sync.preferences.desc" defaultMessage="Customize how your data syncs with WhatsApp" />
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between space-x-2">
                    <div className="flex flex-col space-y-1">
                        <Label htmlFor="auto-sync-contacts" className="font-medium">
                            <FormattedMessage id="settings.sync.contacts.label" defaultMessage="Auto-sync Contacts" />
                        </Label>
                        <span className="text-sm text-muted-foreground">
                            <FormattedMessage id="settings.sync.contacts.help" defaultMessage="Automatically import contacts when WhatsApp connects or updates." />
                        </span>
                    </div>
                    <Switch
                        id="auto-sync-contacts"
                        checked={autoSyncContacts}
                        onCheckedChange={handleToggleContacts}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
