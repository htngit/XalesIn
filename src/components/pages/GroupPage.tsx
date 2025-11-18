import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedCard } from '@/components/ui/animated-card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { FadeIn, Stagger } from '@/components/ui/animations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupService, ContactService, ContactGroup, Contact } from '@/lib/services';
import {
  ArrowLeft,
  Users,
  Plus,
  Edit,
  Trash2,
  Palette,
  Hash,
  UserCheck,
  UserX,
  Phone,
  Search
} from 'lucide-react';

const GROUP_COLORS = [
  '#fbbf24', // amber-400
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#f97316'  // orange-500
];

export function GroupPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isManageContactsDialogOpen, setIsManageContactsDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: GROUP_COLORS[0]
  });

  const groupService = new GroupService();
  const contactService = new ContactService();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [groupsData, contactsData] = await Promise.all([
        groupService.getGroups(),
        contactService.getContacts()
      ]);
      setGroups(groupsData);
      setContacts(contactsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    try {
      if (!formData.name.trim()) {
        alert('Group name is required');
        return;
      }

      const newGroup = await groupService.createGroup({
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color
      });

      setGroups(prev => [...prev, newGroup]);
      setIsCreateDialogOpen(false);
      setFormData({ name: '', description: '', color: GROUP_COLORS[0] });
    } catch (error) {
      console.error('Failed to create group:', error);
      alert('Failed to create group');
    }
  };

  const handleEditGroup = async () => {
    try {
      if (!selectedGroup || !formData.name.trim()) {
        alert('Group name is required');
        return;
      }

      const updatedGroup = await groupService.updateGroup(selectedGroup.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color
      });

      if (updatedGroup) {
        setGroups(prev => prev.map(g => g.id === selectedGroup.id ? updatedGroup : g));
        setIsEditDialogOpen(false);
        setSelectedGroup(null);
        setFormData({ name: '', description: '', color: GROUP_COLORS[0] });
      }
    } catch (error) {
      console.error('Failed to update group:', error);
      alert('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const success = await groupService.deleteGroup(groupId);
      if (success) {
        setGroups(prev => prev.filter(g => g.id !== groupId));
        // Also update contacts that belonged to this group
        setContacts(prev => prev.map(contact => 
          contact.group_id === groupId ? { ...contact, group_id: 'group_regular' } : contact
        ));
      } else {
        alert('Failed to delete group');
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
      alert('Failed to delete group');
    }
  };

  const handleAssignContactsToGroup = async (groupId: string, contactIds: string[]) => {
    try {
      // Update contacts to assign them to the group
      for (const contactId of contactIds) {
        await contactService.updateContact(contactId, { group_id: groupId });
      }
      
      // Update local state
      setContacts(prev => prev.map(contact => 
        contactIds.includes(contact.id) ? { ...contact, group_id: groupId } : contact
      ));
      
      // Refresh group contact counts
      await loadData();
      setIsManageContactsDialogOpen(false);
      setSelectedContacts([]);
    } catch (error) {
      console.error('Failed to assign contacts:', error);
      alert('Failed to assign contacts to group');
    }
  };

  const openEditDialog = (group: ContactGroup) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      color: group.color
    });
    setIsEditDialogOpen(true);
  };

  const openManageContactsDialog = (group: ContactGroup) => {
    setSelectedGroup(group);
    setSelectedContacts([]);
    setContactSearchQuery('');
    setIsManageContactsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', color: GROUP_COLORS[0] });
    setSelectedGroup(null);
  };

  // Filter contacts for assignment
  useEffect(() => {
    if (!selectedGroup) return;
    
    let filtered = contacts.filter(contact => contact.group_id !== selectedGroup.id);
    
    if (contactSearchQuery) {
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
        contact.phone.includes(contactSearchQuery) ||
        (contact.tags && contact.tags.some(tag => tag.toLowerCase().includes(contactSearchQuery.toLowerCase())))
      );
    }
    
    setFilteredContacts(filtered);
  }, [contacts, contactSearchQuery, selectedGroup]);

  const getGroupContacts = (groupId: string) => {
    return contacts.filter(contact => contact.group_id === groupId);
  };

  const getGroupStats = () => {
    const totalContacts = contacts.length;
    const groupsWithCounts = groups.map(group => ({
      ...group,
      contact_count: getGroupContacts(group.id).length
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <FadeIn>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Group Management</h1>
                <p className="text-gray-600">Create and manage contact groups for better segmentation</p>
              </div>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <AnimatedButton animation="scale" onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </AnimatedButton>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Group</DialogTitle>
                  <DialogDescription>
                    Create a new contact group to organize your contacts better.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Group Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., VIP Customers"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of this group"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`w-8 h-8 rounded-full border-2 ${
                            formData.color === color ? 'border-gray-900' : 'border-gray-200'
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => setFormData(prev => ({ ...prev, color }))}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateGroup}>
                    Create Group
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats Cards */}
          <Stagger staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <AnimatedCard animation="slideUp" delay={0.1}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{groups.length}</div>
                <p className="text-xs text-muted-foreground">Active groups</p>
              </CardContent>
            </AnimatedCard>

            <AnimatedCard animation="slideUp" delay={0.2}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">Across all groups</p>
              </CardContent>
            </AnimatedCard>

            <AnimatedCard animation="slideUp" delay={0.3}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Group Size</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.averageGroupSize}</div>
                <p className="text-xs text-muted-foreground">Contacts per group</p>
              </CardContent>
            </AnimatedCard>
          </Stagger>

          {/* Groups Table */}
          <AnimatedCard animation="fadeIn" delay={0.4}>
            <CardHeader>
              <CardTitle>Contact Groups ({groups.length})</CardTitle>
              <CardDescription>
                Manage your contact groups for better message targeting
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading groups...</div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No groups found. Create your first group to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div 
                              className="w-4 h-4 rounded-full border"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="font-medium">{group.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {group.description || 'No description'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getGroupContacts(group.id).length} contacts
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(group.created_at).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                ...
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openManageContactsDialog(group)}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Manage Contacts
                              </DropdownMenuItem>
                              <Dialog open={isEditDialogOpen && selectedGroup?.id === group.id} onOpenChange={setIsEditDialogOpen}>
                                <DialogTrigger asChild>
                                  <DropdownMenuItem onClick={(e) => {
                                    e.preventDefault();
                                    openEditDialog(group);
                                  }}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Edit Group</DialogTitle>
                                    <DialogDescription>
                                      Update group details and appearance.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                      <Label htmlFor="edit-name">Group Name</Label>
                                      <Input
                                        id="edit-name"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g., VIP Customers"
                                      />
                                    </div>
                                    <div className="grid gap-2">
                                      <Label htmlFor="edit-description">Description (Optional)</Label>
                                      <Textarea
                                        id="edit-description"
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Brief description of this group"
                                        rows={3}
                                      />
                                    </div>
                                    <div className="grid gap-2">
                                      <Label>Color</Label>
                                      <div className="flex flex-wrap gap-2">
                                        {GROUP_COLORS.map((color) => (
                                          <button
                                            key={color}
                                            className={`w-8 h-8 rounded-full border-2 ${
                                              formData.color === color ? 'border-gray-900' : 'border-gray-200'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setFormData(prev => ({ ...prev, color }))}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                      Cancel
                                    </Button>
                                    <Button onClick={handleEditGroup}>
                                      Update Group
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onClick={(e) => e.preventDefault()}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Group</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{group.name}"? This action cannot be undone.
                                      {getGroupContacts(group.id).length > 0 && (
                                        <span className="text-red-600 font-medium block mt-2">
                                          Warning: This group contains {getGroupContacts(group.id).length} contacts. They will be moved to the default group.
                                        </span>
                                      )}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteGroup(group.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </AnimatedCard>
        </FadeIn>
      </div>

      {/* Manage Contacts Dialog */}
      <Dialog open={isManageContactsDialogOpen} onOpenChange={setIsManageContactsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Manage Contacts - {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Add or remove contacts from this group. Select contacts below and assign them to this group.
            </DialogDescription>
          </DialogHeader>
          
          {selectedGroup && (
            <div className="grid gap-4 py-4">
              {/* Current Group Members */}
              <div>
                <Label className="text-sm font-medium">Current Members ({getGroupContacts(selectedGroup.id).length})</Label>
                <div className="mt-2 max-h-32 overflow-y-auto border rounded p-2">
                  {getGroupContacts(selectedGroup.id).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contacts in this group</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {getGroupContacts(selectedGroup.id).map((contact) => (
                        <Badge key={contact.id} variant="outline" className="text-xs">
                          {contact.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Search and Selection */}
              <div>
                <Label className="text-sm font-medium">Available Contacts</Label>
                <div className="mt-2">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts to add..."
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Select</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Current Group</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedContacts.includes(contact.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedContacts(prev => [...prev, contact.id]);
                                  } else {
                                    setSelectedContacts(prev => prev.filter(id => id !== contact.id));
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{contact.name}</TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{contact.phone}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {groups.find(g => g.id === contact.group_id)?.name || 'Unknown'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageContactsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedGroup && handleAssignContactsToGroup(selectedGroup.id, selectedContacts)}
              disabled={selectedContacts.length === 0}
            >
              Assign {selectedContacts.length} Contact(s) to Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}