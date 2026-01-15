import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Contact, ContactGroup } from '@/lib/services/types';
import { ContactService } from '@/lib/services/ContactService';
import { Loader2, Plus, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact | null) => void;
  contact?: Contact | null;
  groups: ContactGroup[];
  contactService: ContactService;
  onNotification: (notification: { message: string; type: 'success' | 'error' }) => void;
  mode?: 'add' | 'edit';
}

export function ContactModal({
  isOpen,
  onClose,
  onSave,
  contact,
  groups,
  contactService,
  onNotification,
  mode: _mode
}: ContactModalProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const memoizedGroups = useMemo(() => groups, [groups.length]);

  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone);
        setGroupId(contact.group_id || '');
        setTags(contact.tags || []);
      } else {
        setName('');
        setPhone('');
        setGroupId(memoizedGroups.length > 0 ? memoizedGroups[0].id : '');
        setTags([]);
      }
      setNewTag('');
    }
  }, [isOpen, contact, memoizedGroups]);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags(prev => [...prev, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const validateForm = () => {
    if (!name.trim()) {
      toast({
        title: intl.formatMessage({ id: 'common.validation_error' }),
        description: intl.formatMessage({ id: 'contacts.modal.error.name_required' }),
        variant: "destructive",
      });
      return false;
    }
    if (!phone.trim()) {
      toast({
        title: intl.formatMessage({ id: 'common.validation_error' }),
        description: intl.formatMessage({ id: 'contacts.modal.error.phone_required' }),
        variant: "destructive",
      });
      return false;
    }
    if (!groupId) {
      toast({
        title: intl.formatMessage({ id: 'common.validation_error' }),
        description: intl.formatMessage({ id: 'contacts.modal.error.group_required' }),
        variant: "destructive",
      });
      return false;
    }

    const phoneRegex = /^(\+62|62|0)[0-9]{9,13}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
      toast({
        title: intl.formatMessage({ id: 'common.validation_error' }),
        description: intl.formatMessage({ id: 'contacts.modal.error.phone_invalid' }),
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSaveContact = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      let savedContact: Contact | null = null;
      const contactData = {
        name: name.trim(),
        phone: phone.trim(),
        group_id: groupId,
        tags: tags,
      };

      if (contact) {
        const updatedContact = await contactService.updateContact(contact.id, contactData);
        savedContact = updatedContact;
        if (updatedContact) {
          toast({
            title: intl.formatMessage({ id: 'common.success' }),
            description: intl.formatMessage({ id: 'contacts.modal.save_success_edit' }, { name }),
          });
          onNotification({
            message: intl.formatMessage({ id: 'contacts.modal.save_success_edit' }, { name }),
            type: 'success'
          });
        }
      } else {
        const newContact = await contactService.createContact({
          ...contactData,
          is_blocked: false
        });
        savedContact = newContact;
        toast({
          title: intl.formatMessage({ id: 'common.success' }),
          description: intl.formatMessage({ id: 'contacts.modal.save_success_add' }, { name }),
        });
        onNotification({
          message: intl.formatMessage({ id: 'contacts.modal.save_success_add' }, { name }),
          type: 'success'
        });
      }

      if (savedContact) {
        onSave(savedContact);
        onClose();
      }
    } catch (error) {
      console.error('Error saving contact:', error);
      const mode = contact
        ? intl.formatMessage({ id: 'contacts.modal.updating' }).toLowerCase()
        : intl.formatMessage({ id: 'contacts.modal.adding' }).toLowerCase();

      toast({
        title: intl.formatMessage({ id: 'common.error' }),
        description: intl.formatMessage({ id: 'contacts.modal.save_error' }, { mode }),
        variant: "destructive",
      });
      onNotification({
        message: intl.formatMessage({ id: 'contacts.modal.save_error' }, { mode }),
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
            {contact ? (
              <FormattedMessage id="contacts.modal.edit_title" defaultMessage="Edit Contact" />
            ) : (
              <FormattedMessage id="contacts.modal.add_title" defaultMessage="Add New Contact" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">
              <FormattedMessage id="contacts.modal.name_label" defaultMessage="Name *" />
            </Label>
            <Input
              id="name"
              placeholder={intl.formatMessage({ id: 'contacts.modal.name_placeholder', defaultMessage: 'Enter contact name' })}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">
              <FormattedMessage id="contacts.modal.phone_label" defaultMessage="Phone Number *" />
            </Label>
            <Input
              id="phone"
              placeholder={intl.formatMessage({ id: 'contacts.modal.phone_placeholder', defaultMessage: 'e.g. +62812345678' })}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="group">
              <FormattedMessage id="contacts.modal.group_label" defaultMessage="Group *" />
            </Label>
            <Select
              value={groupId}
              onValueChange={setGroupId}
              disabled={isLoading || memoizedGroups.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={intl.formatMessage({ id: 'contacts.modal.group_placeholder', defaultMessage: 'Select a group' })} />
              </SelectTrigger>
              <SelectContent>
                {memoizedGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
                {memoizedGroups.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    <FormattedMessage id="contacts.modal.no_groups" defaultMessage="No groups available. Please create a group first." />
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>
              <FormattedMessage id="contacts.modal.tags_label" defaultMessage="Tags" />
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder={intl.formatMessage({ id: 'contacts.modal.tags_placeholder', defaultMessage: 'Add tag' })}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
                disabled={isLoading || !newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => !isLoading && handleRemoveTag(tag)}
                      className="hover:text-destructive"
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            <FormattedMessage id="common.button.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleSaveContact} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {contact ? (
              <FormattedMessage id="contacts.modal.update_button" defaultMessage="Update Contact" />
            ) : (
              <FormattedMessage id="contacts.modal.add_button" defaultMessage="Add Contact" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}