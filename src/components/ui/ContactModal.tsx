import { useState, useEffect, useMemo } from 'react';
import { Contact, ContactGroup, ContactService } from '@/lib/services';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact | null) => void;
  mode: 'add' | 'edit';
  contact?: Contact | null;
  groups: ContactGroup[];
  contactService: ContactService;
  onNotification: (notification: { message: string; type: 'success' | 'error' }) => void;
}

export function ContactModal({
  isOpen,
  onClose,
  onSave,
  mode,
  contact,
  groups,
  contactService,
  onNotification
}: ContactModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    group_id: '',
    tags: [] as string[]
  });
  const [newTag, setNewTag] = useState('');

  // Memoize groups dependency to prevent infinite loops
  const memoizedGroups = useMemo(() => groups, [groups.length]);

  // Reset form data when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && contact) {
        setFormData({
          name: contact.name,
          phone: contact.phone,
          group_id: contact.group_id,
          tags: contact.tags || []
        });
      } else {
        setFormData({
          name: '',
          phone: '',
          group_id: memoizedGroups.length > 0 ? memoizedGroups[0].id : '',
          tags: []
        });
      }
      setNewTag('');
    }
  }, [isOpen, mode, contact, memoizedGroups]);

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      addTag();
    }
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      onNotification({ message: 'Name is required', type: 'error' });
      return false;
    }
    if (!formData.phone.trim()) {
      onNotification({ message: 'Phone number is required', type: 'error' });
      return false;
    }
    if (!formData.group_id) {
      onNotification({ message: 'Please select a group', type: 'error' });
      return false;
    }
    
    // Basic phone number validation (Indonesia format)
    const phoneRegex = /^(\+62|62|0)[0-9]{9,13}$/;
    if (!phoneRegex.test(formData.phone.replace(/\s+/g, ''))) {
      onNotification({ message: 'Please enter a valid Indonesian phone number', type: 'error' });
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      let savedContact: Contact | null = null;
      
      if (mode === 'add') {
        const newContact = await contactService.createContact({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          group_id: formData.group_id,
          tags: formData.tags,
          is_blocked: false
        });
        savedContact = newContact;
        onNotification({
          message: `${newContact.name} has been added successfully.`,
          type: 'success'
        });
      } else if (mode === 'edit' && contact) {
        const updatedContact = await contactService.updateContact(contact.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          group_id: formData.group_id,
          tags: formData.tags
        });
        savedContact = updatedContact;
        if (updatedContact) {
          onNotification({
            message: `${updatedContact.name} has been updated successfully.`,
            type: 'success'
          });
        }
      }
      
      if (savedContact) {
        onSave(savedContact);
        onClose();
      }
    } catch (error) {
      console.error('Error saving contact:', error);
      onNotification({
        message: `Failed to ${mode} contact. Please try again.`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add New Contact' : 'Edit Contact'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Name Field */}
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Enter contact name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Phone Field */}
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              placeholder="e.g. +62812345678"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Group Field */}
          <div className="grid gap-2">
            <Label htmlFor="group">Group *</Label>
            <Select
              value={formData.group_id}
              onValueChange={(value) => handleInputChange('group_id', value)}
              disabled={isLoading || memoizedGroups.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {memoizedGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full border"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {memoizedGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No groups available. Please create a group first.
              </p>
            )}
          </div>

          {/* Tags Field */}
          <div className="grid gap-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Add tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTag}
                disabled={isLoading || !newTag.trim()}
              >
                Add
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => !isLoading && removeTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || memoizedGroups.length === 0}
          >
            {isLoading 
              ? (mode === 'add' ? 'Adding...' : 'Updating...')
              : (mode === 'add' ? 'Add Contact' : 'Update Contact')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}