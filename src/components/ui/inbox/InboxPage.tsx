'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntl, FormattedMessage } from 'react-intl';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MessageService, ContactService, GroupService, type AssetFile } from '@/lib/services';
import { ConversationSummary, Message, InboxFilters, ContactGroup, ContactWithGroup } from '@/lib/services/types';
import { syncManager } from '@/lib/sync/SyncManager';
import { ConversationList } from '@/components/ui/inbox/ConversationList';
import { ChatWindow } from '@/components/ui/inbox/ChatWindow';
import { ChatHeader } from '@/components/ui/inbox/ChatHeader';
import { InboxFiltersPanel } from '@/components/ui/inbox/InboxFilters';
import { NewChatDialog } from '@/components/ui/inbox/NewChatDialog';
import { cn } from '@/lib/utils';

interface IncomingWhatsAppMessage {
    id: string;
    from: string;
    to: string;
    body: string;
    type: string;
    timestamp: number;
    hasMedia: boolean;
    isUnsubscribeRequest?: boolean;
}

export function InboxPage() {
    const intl = useIntl();
    const navigate = useNavigate();
    const [messageService] = useState(() => new MessageService(syncManager));
    const [groupService] = useState(() => new GroupService(syncManager));
    const [contactService] = useState(() => new ContactService(syncManager));

    // State
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<ConversationSummary | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [groups, setGroups] = useState<ContactGroup[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [filters, setFilters] = useState<InboxFilters>({});
    const [showFilters, setShowFilters] = useState(false);

    // WhatsApp connection warning state
    const [showConnectionWarning, setShowConnectionWarning] = useState(false);


    // History Sync State
    const [isSyncingHistory, setIsSyncingHistory] = useState(false);
    const [syncStatusMessage, setSyncStatusMessage] = useState('');
    const isSyncingHistoryRef = useRef(false);

    // Keep ref in sync
    useEffect(() => {
        isSyncingHistoryRef.current = isSyncingHistory;
    }, [isSyncingHistory]);

    // Trigger History Sync on Mount (Once per session)
    useEffect(() => {
        const hasSynced = sessionStorage.getItem('hasSyncedHistory');
        const triggerSync = async () => {
            if (!hasSynced && window.electron?.whatsapp?.fetchHistory) {
                try {
                    console.log('[Inbox] Triggering on-demand history sync...');
                    setIsSyncingHistory(true);
                    setSyncStatusMessage(intl.formatMessage({ id: 'inbox.syncing.start', defaultMessage: 'Initializing history sync...' }));

                    const result = await window.electron.whatsapp.fetchHistory();
                    if (result.success) {
                        sessionStorage.setItem('hasSyncedHistory', 'true');
                    }
                } catch (error) {
                    console.error('[Inbox] History sync failed:', error);
                }
            }
        };

        // Trigger immediately (Connection guard is already delayed by 5s)
        triggerSync();
    }, [intl]);

    // Listen for Sync Status Events
    useEffect(() => {
        if (!window.electron?.whatsapp?.onSyncStatus) return;

        const unsubscribe = window.electron.whatsapp.onSyncStatus((status) => {
            console.log('[Inbox] Sync status:', status);
            if (status.step === 'complete' || status.step === 'error') {
                setIsSyncingHistory(false);
                setSyncStatusMessage('');
            } else {
                setIsSyncingHistory(true);
                setSyncStatusMessage(status.message);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // Ref to hold the latest selectedConversation (to avoid stale closure in IPC callback)
    const selectedConversationRef = useRef<ConversationSummary | null>(null);

    // Keep ref in sync with state
    useEffect(() => {
        selectedConversationRef.current = selectedConversation;
    }, [selectedConversation]);

    // Check WhatsApp connection status: ONLY via listener (avoid race conditions with fetchHistory)
    useEffect(() => {
        let unsubscribeStatus: (() => void) | undefined;
        let isMounted = true;

        const timer = setTimeout(() => {
            if (!isMounted) return;
            console.log('[Inbox] Registering connection status listener (after 5s delay)...');

            // DON'T do an active check - just listen for events from now on.
            // The active check was causing false positives during soft reconnects.
            unsubscribeStatus = window.electron.whatsapp.onStatusChange((newStatus: string) => {
                console.log('[Inbox] Status change received:', newStatus);
                if (newStatus === 'disconnected' && !isSyncingHistoryRef.current) {
                    setShowConnectionWarning(true);
                } else if (newStatus === 'ready') {
                    setShowConnectionWarning(false);
                }
            });

        }, 5000); // 5 seconds delay

        return () => {
            isMounted = false;
            clearTimeout(timer);
            if (unsubscribeStatus) unsubscribeStatus();
        };
    }, []);

    // Handle warning dialog close - navigate back to dashboard
    const handleWarningClose = () => {
        setShowConnectionWarning(false);
        navigate('/');
    };

    // Load conversations
    const loadConversations = useCallback(async () => {
        try {
            const convs = await messageService.getConversations(filters);
            setConversations(convs);
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }, [messageService, filters]);

    // Load messages for selected conversation
    const loadMessages = useCallback(async (phone: string) => {
        setIsLoadingMessages(true);
        try {
            const msgs = await messageService.getMessagesByPhone(phone);
            setMessages(msgs);

            // Mark as read
            const unreadIds = msgs
                .filter(m => m.direction === 'inbound' && m.status === 'received')
                .map(m => m.id);
            if (unreadIds.length > 0) {
                await messageService.markAsRead(unreadIds);
                loadConversations(); // Refresh to update unread counts
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            setIsLoadingMessages(false);
        }
    }, [messageService, loadConversations]);

    // Initial load
    useEffect(() => {
        const initialize = async () => {
            setIsLoading(true);
            try {
                // Load groups and tags for filters
                const [grps, availableTags] = await Promise.all([
                    groupService.getGroups(),
                    messageService.getAvailableTags()
                ]);
                setGroups(grps);
                setTags(availableTags);

                // Load conversations
                await loadConversations();
            } catch (error) {
                console.error('Error initializing inbox:', error);
            } finally {
                setIsLoading(false);
            }
        };

        initialize();
    }, [groupService, messageService, loadConversations]);

    // Handle incoming WhatsApp messages
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const handleIncomingMessage = async (data: unknown) => {
            const messageData = data as IncomingWhatsAppMessage;
            try {
                console.log('[Inbox] Incoming message received:', messageData.from);
                await messageService.createFromIncomingWhatsApp(messageData);
                await loadConversations();

                // Use ref to get the CURRENT selectedConversation (avoids stale closure)
                const currentConversation = selectedConversationRef.current;
                if (currentConversation) {
                    const normalizedPhone = messageData.from.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^\d]/g, '');
                    if (currentConversation.contact_phone.replace(/[^\d]/g, '') === normalizedPhone) {
                        console.log('[Inbox] Reloading messages for current conversation');
                        await loadMessages(currentConversation.contact_phone);
                    }
                }
            } catch (error) {
                console.error('Error handling incoming message:', error);
            }
        };

        // Use the correct electron whatsapp API
        if (window.electron?.whatsapp?.onMessageReceived) {
            unsubscribe = window.electron.whatsapp.onMessageReceived(handleIncomingMessage);
        }

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [messageService, loadConversations, loadMessages]);

    // Send Message
    const handleSendMessage = async (content: string, asset?: AssetFile) => {
        if (!selectedConversation) return;

        try {
            // 1. Send via WhatsApp
            const assets = asset ? [asset.file_url || asset.url || ''] : undefined;
            const result = await window.electron.whatsapp.sendMessage(
                selectedConversation.contact_phone,
                content,
                assets
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to send message');
            }

            // 2. Wait a bit for the message to be saved by async listener
            // Then refresh messages and conversation list
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadMessages(selectedConversation.contact_phone);
            await loadConversations();

        } catch (error) {
            console.error('Failed to send message:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to send message');
        }
    };

    // Handle conversation selection
    const handleSelectConversation = useCallback((conversation: ConversationSummary) => {
        setSelectedConversation(conversation);
        loadMessages(conversation.contact_phone);
    }, [loadMessages]);

    // Handle tag update
    const handleUpdateTags = useCallback(async (contactId: string, newTags: string[]) => {
        try {
            await contactService.updateContact(contactId, { tags: newTags });
            await loadConversations();

            // Refresh available tags to include any new tags in the filter
            const updatedTags = await messageService.getAvailableTags();
            setTags(updatedTags);

            // Update selected conversation if it's the one being updated
            if (selectedConversation?.contact_id === contactId) {
                setSelectedConversation(prev => prev ? { ...prev, contact_tags: newTags } : null);
            }
        } catch (error) {
            console.error('Error updating tags:', error);
        }
    }, [contactService, messageService, loadConversations, selectedConversation]);

    // Handle save new contact from chat
    const handleSaveContact = useCallback(async (phone: string, name?: string) => {
        try {
            const newContact = await contactService.createContact({
                phone: phone,
                name: name || phone,
                is_blocked: false,
            });

            toast.success(intl.formatMessage({
                id: 'inbox.contactSaved',
                defaultMessage: 'Contact saved successfully!'
            }));

            // Refresh conversations to update the contact_id
            await loadConversations();

            // Update selected conversation with the new contact_id
            if (selectedConversation?.contact_phone === phone) {
                setSelectedConversation(prev => prev ? {
                    ...prev,
                    contact_id: newContact.id,
                    contact_name: newContact.name,
                } : null);
            }
        } catch (error) {
            console.error('Error saving contact:', error);
            toast.error(intl.formatMessage({
                id: 'inbox.contactSaveError',
                defaultMessage: 'Failed to save contact'
            }));
        }
    }, [contactService, intl, loadConversations, selectedConversation]);

    // Handle filter change
    const handleFilterChange = useCallback((newFilters: InboxFilters) => {
        setFilters(newFilters);
    }, []);

    // Apply filters effect
    useEffect(() => {
        loadConversations();
    }, [filters, loadConversations]);

    // Handle delete chats
    const handleDeleteChats = useCallback(async (phones: string[]) => {
        try {
            await messageService.deleteMessagesByPhone(phones);
            await loadConversations();

            // Clear selected conversation if it was deleted
            if (selectedConversation && phones.includes(selectedConversation.contact_phone)) {
                setSelectedConversation(null);
                setMessages([]);
            }
        } catch (error) {
            console.error('Error deleting chats:', error);
        }
    }, [messageService, loadConversations, selectedConversation]);

    const handleNewChat = () => {
        setIsNewChatOpen(true);
    };

    const handleSelectContact = (contact: ContactWithGroup) => {
        // Check if conversation already exists
        const existingConversation = conversations.find(c => c.contact_phone === contact.phone);

        if (existingConversation) {
            setSelectedConversation(existingConversation);
            loadMessages(existingConversation.contact_phone);
        } else {
            // Create temporary conversation object for new chat
            const newConversation: ConversationSummary = {
                contact_phone: contact.phone,
                contact_name: contact.name,
                contact_id: contact.id,
                contact_group_id: contact.groups?.id,
                contact_group_name: contact.groups?.name,
                contact_group_color: contact.groups?.color,
                unread_count: 0,
                last_activity: new Date().toISOString()
            };
            setSelectedConversation(newConversation);
            // Clear old messages and load new contact's messages (likely empty for new chat)
            setMessages([]);
            loadMessages(contact.phone);
        }
        setIsNewChatOpen(false);
    };



    return (
        <>
            {/* WhatsApp Connection Warning Dialog */}
            <AlertDialog open={showConnectionWarning} onOpenChange={() => { }}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            <FormattedMessage
                                id="inbox.connectionWarning.title"
                                defaultMessage="WhatsApp Not Connected"
                            />
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-left">
                            <FormattedMessage
                                id="inbox.connectionWarning.description"
                                defaultMessage="You need to connect to WhatsApp first before accessing the Inbox. Please connect your WhatsApp account from the Dashboard."
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={handleWarningClose} className="w-full">
                            <FormattedMessage
                                id="inbox.connectionWarning.button"
                                defaultMessage="Go to Dashboard"
                            />
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex h-screen bg-background overflow-hidden">
                {/* Sidebar: Conversation List */}
                <div className={cn(
                    "flex flex-col border-r border-border flex-shrink-0 h-full overflow-hidden",
                    "w-full md:w-[380px] lg:w-[420px]",
                    selectedConversation ? "hidden md:flex" : "flex"
                )}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(-1)}
                                className="h-8 w-8"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <h1 className="text-xl font-semibold">
                                {intl.formatMessage({ id: 'inbox.title', defaultMessage: 'Inbox' })}
                            </h1>
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showFilters ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            )}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                        </button>
                    </div>


                    {/* Sync Progress Banner */}
                    {isSyncingHistory && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-xs flex items-center justify-between border-b border-blue-100 dark:border-blue-800">
                            <span className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                                <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                                {syncStatusMessage || 'Syncing history...'}
                            </span>
                        </div>
                    )}

                    {/* Filters Panel */}
                    {showFilters && (
                        <InboxFiltersPanel
                            groups={groups}
                            tags={tags}
                            filters={filters}
                            onFilterChange={handleFilterChange}
                        />
                    )}

                    {/* Conversation List */}
                    <ConversationList
                        conversations={conversations}
                        selectedPhone={selectedConversation?.contact_phone}
                        onSelect={handleSelectConversation}
                        onNewChat={handleNewChat}
                        onDeleteChats={handleDeleteChats}
                        isLoading={isLoading}
                    />
                </div>

                {/* Main: Chat Window */}
                <div className={cn(
                    "flex-1 flex flex-col overflow-hidden",
                    !selectedConversation ? "hidden md:flex" : "flex"
                )}>
                    {selectedConversation ? (
                        <>
                            <ChatHeader
                                conversation={selectedConversation}
                                availableTags={tags}
                                onUpdateTags={handleUpdateTags}
                                onSaveContact={handleSaveContact}
                                onBack={() => setSelectedConversation(null)}
                            />
                            <ChatWindow
                                messages={messages}
                                isLoading={isLoadingMessages}
                                onSendMessage={handleSendMessage}
                                selectedPhone={selectedConversation.contact_phone}
                            />
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="64"
                                    height="64"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="mx-auto mb-4 opacity-50"
                                >
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p className="text-lg">
                                    {intl.formatMessage({
                                        id: 'inbox.selectConversation',
                                        defaultMessage: 'Select a conversation to start chatting'
                                    })}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <NewChatDialog
                    open={isNewChatOpen}
                    onOpenChange={setIsNewChatOpen}
                    onSelectContact={handleSelectContact}
                />
            </div>
        </>
    );
}
