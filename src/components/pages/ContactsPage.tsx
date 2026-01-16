import { useState, useEffect, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/lib/services/ServiceContext';
import { handleServiceError } from '@/lib/utils/errorHandling';
import { Contact, ContactGroup } from '@/lib/services/types';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedCard } from '@/components/ui/animated-card';
import { FadeIn } from '@/components/ui/animations';
import { ContactModal } from '@/components/ui/ContactModal';
import { UploadContactsDialog } from '@/components/ui/UploadContactsDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { ContactsPagination } from '@/components/ui/ContactsPagination';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ScrapTab } from '@/components/ui/ScrapTab';
import {
  Search,
  Upload,
  UserPlus,
  Users,
  Settings,
  Phone,
  Tag,
  ArrowLeft,
  Hash,
  MoreHorizontal,
  Edit,
  Trash2,
  MapPin,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

// Placeholder content component for when data is loaded
function ContactsPageContent({
  contacts,
  filteredContacts,
  paginatedContacts,
  searchQuery,
  setSearchQuery,
  selectedContactIds,
  handleSelectContact,
  handleSelectAll,
  handleAddContact,
  handleEditContact,
  handleDeleteContact,
  handleBulkDelete,
  showBulkDeleteDialog,
  confirmBulkDelete,
  cancelBulkDelete,
  isBulkDeleting,
  getGroupById,
  stats,
  isLoading,
  onUploadClick,
  onRefresh,
  groups,
  paginationComponent
}: {
  contacts: Contact[];
  filteredContacts: Contact[];
  paginatedContacts: Contact[];
  groups: ContactGroup[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedContactIds: Set<string>;
  handleSelectContact: (contactId: string, checked: boolean) => void;
  handleSelectAll: (checked: boolean) => void;
  handleAddContact: () => void;
  handleEditContact: (contactId: string) => void;
  handleDeleteContact: (contactId: string) => void;
  handleBulkDelete: () => void;
  showBulkDeleteDialog: boolean;
  confirmBulkDelete: () => void;
  cancelBulkDelete: () => void;
  isBulkDeleting: boolean;
  getGroupById: (groupId: string) => ContactGroup | undefined;
  stats: any;
  isLoading: boolean;
  onUploadClick: () => void;
  onRefresh: () => void;
  paginationComponent: React.ReactNode;
}) {
  const navigate = useNavigate();
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState("contacts");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <FadeIn>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Header */}
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {intl.formatMessage({ id: 'common.button.back', defaultMessage: 'Back' })}
                  </Button>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">{intl.formatMessage({ id: 'contacts.title', defaultMessage: 'Contacts' })}</h1>
                    <p className="text-gray-600">{intl.formatMessage({ id: 'contacts.subtitle', defaultMessage: 'Manage your WhatsApp contacts organized by groups' })}</p>
                  </div>
                </div>
                {activeTab === 'contacts' && (
                  <div className="flex space-x-2">
                    <AnimatedButton
                      animation="scale"
                      variant="outline"
                      onClick={() => navigate('/groups')}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {intl.formatMessage({ id: 'contacts.button.manage_groups', defaultMessage: 'Manage Groups' })}
                    </AnimatedButton>

                    {/* Sync from Server Button */}
                    <AnimatedButton
                      animation="scale"
                      variant="outline"
                      onClick={onRefresh}
                      disabled={isLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      {isLoading
                        ? intl.formatMessage({ id: 'contacts.button.syncing', defaultMessage: 'Syncing...' })
                        : intl.formatMessage({ id: 'contacts.button.sync_server', defaultMessage: 'Sync from Server' })
                      }
                    </AnimatedButton>

                    {/* Consolidated Add/Import Button */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <AnimatedButton animation="scale">
                          <UserPlus className="h-4 w-4 mr-2" />
                          {intl.formatMessage({ id: 'contacts.button.add', defaultMessage: 'Add Contact' })}
                          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                        </AnimatedButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleAddContact}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          {intl.formatMessage({ id: 'contacts.button.add_individual', defaultMessage: 'Add Individual' })}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onUploadClick}>
                          <Upload className="h-4 w-4 mr-2" />
                          {intl.formatMessage({ id: 'contacts.button.upload', defaultMessage: 'Upload Contacts' })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              <TabsList className="w-fit">
                <TabsTrigger value="contacts" className="w-[150px]">
                  <Users className="mr-2 h-4 w-4" />
                  List Contacts
                </TabsTrigger>
                <TabsTrigger value="scrap" className="w-[150px]">
                  <MapPin className="mr-2 h-4 w-4" />
                  Scrap Maps
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="contacts" className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AnimatedCard animation="slideUp" delay={0.1}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{intl.formatMessage({ id: 'contacts.stats.total', defaultMessage: 'Total Contacts' })}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-2xl font-bold">{stats.total}</div>
                    )}
                    <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'contacts.stats.total.desc', defaultMessage: 'All contacts' })}</p>
                  </CardContent>
                </AnimatedCard>

                <AnimatedCard animation="slideUp" delay={0.2}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{intl.formatMessage({ id: 'contacts.stats.groups', defaultMessage: 'Groups' })}</CardTitle>
                    <Hash className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-2xl font-bold">{stats.groups.length}</div>
                    )}
                    <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'contacts.stats.groups.desc', defaultMessage: 'Contact groups' })}</p>
                  </CardContent>
                </AnimatedCard>

                <AnimatedCard animation="slideUp" delay={0.3}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{intl.formatMessage({ id: 'contacts.stats.avg_size', defaultMessage: 'Avg Group Size' })}</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-2xl font-bold">{stats.averageGroupSize}</div>
                    )}
                    <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'contacts.stats.avg_size.desc', defaultMessage: 'Contacts per group' })}</p>
                  </CardContent>
                </AnimatedCard>
              </div>

              {/* Search Only */}
              <AnimatedCard animation="fadeIn" delay={0.4}>
                <CardHeader>
                  <CardTitle>{intl.formatMessage({ id: 'contacts.search.title', defaultMessage: 'Search Contacts' })}</CardTitle>
                  <CardDescription>
                    {intl.formatMessage({ id: 'contacts.search.desc', defaultMessage: 'Search contacts by name, phone, or tags. Group filtering handled via database logic.' })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={intl.formatMessage({ id: 'contacts.search.placeholder', defaultMessage: 'Search contacts by name, phone, or tags...' })}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </AnimatedCard>

              {/* Contacts Table */}
              <AnimatedCard animation="fadeIn" delay={0.5} className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{intl.formatMessage({ id: 'contacts.list.title', defaultMessage: 'Contacts List' })} ({filteredContacts.length})</CardTitle>
                      <CardDescription>
                        {searchQuery
                          ? intl.formatMessage({ id: 'contacts.list.desc.search', defaultMessage: 'All contacts matching "{query}"' }, { query: searchQuery })
                          : intl.formatMessage({ id: 'contacts.list.desc.all', defaultMessage: 'All contacts across all groups' })
                        }
                      </CardDescription>
                    </div>
                    {selectedContactIds.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {intl.formatMessage({ id: 'contacts.button.delete_selected', defaultMessage: 'Delete ({count})' }, { count: selectedContactIds.size })}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {paginatedContacts.length === 0 && !isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery
                        ? intl.formatMessage({ id: 'contacts.empty.search', defaultMessage: 'No contacts found matching your search.' })
                        : intl.formatMessage({ id: 'contacts.empty.all', defaultMessage: 'No contacts found. Add some contacts to get started.' })
                      }
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedContactIds.size === paginatedContacts.length && paginatedContacts.length > 0}
                              onCheckedChange={handleSelectAll}
                              aria-label={intl.formatMessage({ id: 'contacts.list.aria.select_all', defaultMessage: 'Select all contacts' })}
                              disabled={isLoading}
                            />
                          </TableHead>
                          <TableHead className="w-[200px] md:w-[250px]">{intl.formatMessage({ id: 'contacts.list.header.name', defaultMessage: 'Name' })}</TableHead>
                          <TableHead className="w-[150px]">{intl.formatMessage({ id: 'contacts.list.header.phone', defaultMessage: 'Phone' })}</TableHead>
                          <TableHead className="w-[150px]">{intl.formatMessage({ id: 'contacts.list.header.group', defaultMessage: 'Group' })}</TableHead>
                          <TableHead className="hidden md:table-cell">{intl.formatMessage({ id: 'contacts.list.header.tags', defaultMessage: 'Tags' })}</TableHead>
                          <TableHead className="hidden lg:table-cell w-[120px]">{intl.formatMessage({ id: 'contacts.list.header.created', defaultMessage: 'Created' })}</TableHead>
                          <TableHead className="w-[50px]">{intl.formatMessage({ id: 'contacts.list.header.actions', defaultMessage: 'Actions' })}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          // Skeleton Rows
                          Array.from({ length: 5 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                              <TableCell className="hidden md:table-cell"><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                              <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                            </TableRow>
                          ))
                        ) : filteredContacts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              {searchQuery
                                ? intl.formatMessage({ id: 'contacts.empty.search', defaultMessage: 'No contacts found matching your search.' })
                                : intl.formatMessage({ id: 'contacts.empty.all', defaultMessage: 'No contacts found. Add some contacts to get started.' })
                              }
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedContacts.map((contact) => {
                            const group = contact.group_id ? getGroupById(contact.group_id) : undefined;
                            const isSelected = selectedContactIds.has(contact.id);
                            return (
                              <TableRow key={contact.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                                    aria-label={`Select ${contact.name}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium max-w-[200px] md:max-w-[250px] truncate" title={contact.name}>{contact.name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <span className="truncate">{contact.phone}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {group ? (
                                    <Badge variant="outline" className="flex items-center gap-1 w-fit max-w-[140px] truncate" title={group.name}>
                                      <div
                                        className="w-3 h-3 rounded-full border flex-shrink-0"
                                        style={{ backgroundColor: group.color }}
                                      />
                                      <span className="truncate">{group.name}</span>
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">{intl.formatMessage({ id: 'contacts.badge.unknown_group', defaultMessage: 'Unknown Group' })}</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {contact.tags && contact.tags.length > 0 ? (
                                      contact.tags.slice(0, 2).map((tag) => (
                                        <Badge key={tag} variant="outline" className="text-xs truncate max-w-[80px]" title={tag}>
                                          <Tag className="h-3 w-3 mr-1 flex-shrink-0" />
                                          <span className="truncate">{tag}</span>
                                        </Badge>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground text-sm">{intl.formatMessage({ id: 'contacts.badge.no_tags', defaultMessage: 'No tags' })}</span>
                                    )}
                                    {contact.tags && contact.tags.length > 2 && (
                                      <Badge variant="outline" className="text-xs">+{contact.tags.length - 2}</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(contact.created_at).toLocaleDateString()}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditContact(contact.id)}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        {intl.formatMessage({ id: 'contacts.action.edit', defaultMessage: 'Edit' })}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteContact(contact.id)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        {intl.formatMessage({ id: 'contacts.action.delete', defaultMessage: 'Delete' })}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </AnimatedCard>

              <div className="mt-6">
                {paginationComponent}
              </div>
            </TabsContent>

            <TabsContent value="scrap">
              <ScrapTab groups={groups} existingContacts={contacts} onContactsSaved={onRefresh} />
            </TabsContent>
          </Tabs>
        </FadeIn>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={cancelBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{intl.formatMessage({ id: 'contacts.dialog.bulk_delete.title', defaultMessage: 'Confirm Bulk Delete' })}</AlertDialogTitle>
              <AlertDialogDescription>
                {intl.formatMessage({ id: 'contacts.dialog.bulk_delete.desc', defaultMessage: 'Are you sure you want to delete {count} contact{s}?' }, { count: selectedContactIds.size, s: selectedContactIds.size > 1 ? 's' : '' })}
                {' '}{intl.formatMessage({ id: 'contacts.dialog.delete.desc', defaultMessage: 'This action cannot be undone.' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelBulkDelete} disabled={isBulkDeleting}>
                {intl.formatMessage({ id: 'common.button.cancel', defaultMessage: 'Cancel' })}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmBulkDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? intl.formatMessage({ id: 'contacts.button.deleting', defaultMessage: 'Deleting...' }) : intl.formatMessage({ id: 'contacts.button.delete_all', defaultMessage: 'Delete All' })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function ContactsPage() {
  const { contactService, groupService, isInitialized } = useServices();
  const intl = useIntl();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Multi-select state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Modal handler functions
  const handleAddContact = () => {
    setModalMode('add');
    setSelectedContact(null);
    setIsModalOpen(true);
  };

  const handleEditContact = async (contactId: string) => {
    try {
      const contact = await contactService.getContactById(contactId);
      if (contact) {
        setModalMode('edit');
        setSelectedContact(contact);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching contact for edit:', error);
      setNotification({ message: intl.formatMessage({ id: 'contacts.notification.load_error', defaultMessage: 'Error loading contact for editing' }), type: 'error' });
    }
  };

  const handleModalSave = async (savedContact: Contact | null) => {
    if (!savedContact) return;
    // Refresh the contacts list
    await loadData();
    setNotification(null);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedContact(null);
  };

  const handleDeleteContact = async (contactId: string) => {
    setDeleteContactId(contactId);
    setShowDeleteDialog(true);
  };

  const confirmDeleteContact = async () => {
    if (!deleteContactId) return;

    try {
      const contact = await contactService.getContactById(deleteContactId);
      if (contact) {
        const success = await contactService.deleteContact(deleteContactId);
        if (success) {
          // Refresh the contacts list
          await loadData();
          setNotification({ message: intl.formatMessage({ id: 'contacts.notification.delete_success', defaultMessage: '{name} has been deleted successfully.' }, { name: contact.name }), type: 'success' });
        } else {
          setNotification({ message: intl.formatMessage({ id: 'contacts.notification.delete_failed', defaultMessage: 'Failed to delete contact. Please try again.' }), type: 'error' });
        }
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      setNotification({ message: intl.formatMessage({ id: 'contacts.notification.delete_error', defaultMessage: 'An error occurred while deleting the contact.' }), type: 'error' });
    } finally {
      setShowDeleteDialog(false);
      setDeleteContactId(null);
    }
  };

  const cancelDeleteContact = () => {
    setShowDeleteDialog(false);
    setDeleteContactId(null);
  };

  // Multi-select handlers
  const handleSelectContact = (contactId: string, checked: boolean) => {
    setSelectedContactIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(contactId);
      } else {
        newSet.delete(contactId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContactIds(new Set(paginatedContacts.map((contact: Contact) => contact.id)));
    } else {
      setSelectedContactIds(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selectedContactIds.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedContactIds.size === 0) return;

    try {
      setIsBulkDeleting(true);
      const idsToDelete = Array.from(selectedContactIds);
      const result = await contactService.deleteMultipleContacts(idsToDelete);

      if (result.success) {
        await loadData();
        setSelectedContactIds(new Set());
        toast({
          title: intl.formatMessage({ id: 'common.status.success', defaultMessage: 'Success' }),
          description: intl.formatMessage({ id: 'contacts.notification.bulk_delete_success', defaultMessage: '{count} contact{s} deleted successfully.' }, { count: result.deletedCount, s: result.deletedCount > 1 ? 's' : '' }),
        });
      } else {
        toast({
          title: intl.formatMessage({ id: 'common.status.error', defaultMessage: 'Error' }),
          description: intl.formatMessage({ id: 'contacts.notification.bulk_delete_failed', defaultMessage: 'Failed to delete contacts. Please try again.' }),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting contacts:', error);
      toast({
        title: intl.formatMessage({ id: 'common.status.error', defaultMessage: 'Error' }),
        description: intl.formatMessage({ id: 'contacts.notification.bulk_delete_error', defaultMessage: 'An error occurred while deleting contacts.' }),
        variant: "destructive",
      });
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const cancelBulkDelete = () => {
    setShowBulkDeleteDialog(false);
  };

  const loadData = async (forceSync = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Force sync from server before loading local data
      if (forceSync) {
        console.log('Force syncing contacts from server...');
        await contactService.forceSync();
      }

      const [contactsData, groupsData] = await Promise.all([
        contactService.getContacts(), // Fetches fresh data from Dexie (now updated by sync)
        groupService.getGroups()
      ]);
      setContacts(contactsData);
      setGroups(groupsData);
    } catch (err) {
      console.error('Failed to load contacts data:', err);
      const appError = handleServiceError(err, 'loadContacts');
      setError(appError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized) {
      loadData();
    }
  }, [isInitialized, contactService, groupService]);

  // Filter contacts effect - synchronous filtering logic
  useEffect(() => {
    let filtered = [...contacts];

    // Filter by search query only
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => {
        const group = groups.find(g => g.id === contact.group_id);
        return (
          contact.name.toLowerCase().includes(lowerQuery) ||
          contact.phone.includes(searchQuery) ||
          (contact.tags && contact.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
          (group && group.name.toLowerCase().includes(lowerQuery))
        );
      });
    }

    setFilteredContacts(filtered);
    // Reset to first page when contacts or search query changes
    setCurrentPage(1);
  }, [contacts, searchQuery, groups]);

  // Pagination effect - calculate paginated contacts
  const paginatedContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredContacts.slice(startIndex, endIndex);
  }, [filteredContacts, currentPage, itemsPerPage]);

  const getGroupById = (groupId: string) => {
    return groups.find(g => g.id === groupId);
  };

  const getGroupStats = () => {
    const totalContacts = contacts.length;
    const groupsWithCounts = groups.map(group => ({
      ...group,
      contact_count: contacts.filter(c => c.group_id === group.id).length
    }));

    return {
      total: totalContacts,
      groups: groupsWithCounts,
      largestGroup: groupsWithCounts.reduce((largest, group) =>
        (group.contact_count || 0) > (largest.contact_count || 0) ? group : largest,
        groupsWithCounts[0]
      ),
      averageGroupSize: groupsWithCounts.length > 0
        ? Math.round(groupsWithCounts.reduce((sum, group) => sum + (group.contact_count || 0), 0) / groupsWithCounts.length)
        : 0
    };
  };

  const stats = getGroupStats();

  // if (isLoading) {
  //   return <LoadingScreen message="Loading contacts..." />;
  // }

  if (error) {
    return <ErrorScreen error={error} onRetry={loadData} />;
  }

  return (
    <>
      <ContactsPageContent
        contacts={contacts}
        filteredContacts={filteredContacts}
        paginatedContacts={paginatedContacts}
        groups={groups}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedContactIds={selectedContactIds}
        handleSelectContact={handleSelectContact}
        handleSelectAll={handleSelectAll}
        handleAddContact={handleAddContact}
        handleEditContact={handleEditContact}
        handleDeleteContact={handleDeleteContact}
        handleBulkDelete={handleBulkDelete}
        showBulkDeleteDialog={showBulkDeleteDialog}
        confirmBulkDelete={confirmBulkDelete}
        cancelBulkDelete={cancelBulkDelete}
        isBulkDeleting={isBulkDeleting}
        getGroupById={getGroupById}
        stats={stats}
        isLoading={isLoading}
        onUploadClick={() => setShowUploadDialog(true)}
        onRefresh={() => loadData(true)}
        paginationComponent={
          <ContactsPagination
            totalItems={filteredContacts.length}
            itemsPerPage={itemsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        }
      />

      {/* Contact Modal */}
      <ContactModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        mode={modalMode}
        contact={selectedContact || undefined}
        groups={groups}
        contactService={contactService}
        onNotification={setNotification}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{intl.formatMessage({ id: 'contacts.dialog.delete.title', defaultMessage: 'Confirm Delete' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage({ id: 'contacts.dialog.delete.desc', defaultMessage: 'Are you sure you want to delete this contact? This action cannot be undone.' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteContact}>{intl.formatMessage({ id: 'common.button.cancel', defaultMessage: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteContact} className="bg-red-600 hover:bg-red-700">
              {intl.formatMessage({ id: 'contacts.action.delete', defaultMessage: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Contacts Dialog */}
      <UploadContactsDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        onSuccess={() => {
          loadData();
          setNotification({ message: intl.formatMessage({ id: 'contacts.notification.upload_success', defaultMessage: 'Contacts uploaded successfully' }), type: 'success' });
        }}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`rounded-lg p-4 shadow-lg ${notification.type === 'success'
            ? 'bg-green-100 border border-green-200 text-green-800'
            : 'bg-red-100 border border-red-200 text-red-800'
            }`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="ml-4 text-sm opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}