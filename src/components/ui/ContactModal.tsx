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
import { Contact, ContactGroup, LEAD_STATUSES } from '@/lib/services/types';
import { ContactService } from '@/lib/services/ContactService';
import { Loader2, Plus, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";

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

  // CRM State
  const [leadStatus, setLeadStatus] = useState<string>('new');
  const [leadSource, setLeadSource] = useState<string>('manual');
  const [leadScore, setLeadScore] = useState<number>(0);
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [dealValue, setDealValue] = useState<string>('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [lostReason, setLostReason] = useState('');

  const memoizedGroups = useMemo(() => groups, [groups.length]);

  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone);
        setGroupId(contact.group_id || '');
        setTags(contact.tags || []);

        // CRM Fields
        setLeadStatus(contact.lead_status || 'new');
        setLeadSource(contact.lead_source || 'manual');
        setLeadScore(contact.lead_score || 0);
        setCompany(contact.company || '');
        setJobTitle(contact.job_title || '');
        setEmail(contact.email || '');
        setAddress(contact.address || '');
        setCity(contact.city || '');
        setDealValue(contact.deal_value?.toString() || '');
        if (contact.next_follow_up) {
          // Format for datetime-local: YYYY-MM-DDThh:mm
          try {
            const date = new Date(contact.next_follow_up);
            // Adjust to local ISO string for input
            const localIso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setNextFollowUp(localIso);
          } catch (e) {
            setNextFollowUp('');
          }
        } else {
          setNextFollowUp('');
        }
        setLostReason(contact.lost_reason || '');

      } else {
        setName('');
        setPhone('');
        setGroupId(memoizedGroups.length > 0 ? memoizedGroups[0].id : '');
        setTags([]);

        // CRM Defaults
        setLeadStatus('new');
        setLeadSource('manual');
        setLeadScore(0);
        setCompany('');
        setJobTitle('');
        setEmail('');
        setAddress('');
        setCity('');
        setDealValue('');
        setNextFollowUp('');
        setLostReason('');
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
        // CRM Fields
        lead_status: leadStatus,
        lead_source: leadSource,
        lead_score: leadScore,
        company: company || undefined,
        job_title: jobTitle || undefined,
        email: email || undefined,
        address: address || undefined,
        city: city || undefined,
        deal_value: dealValue ? parseFloat(dealValue) : 0,
        next_follow_up: nextFollowUp ? new Date(nextFollowUp).toISOString() : undefined,
        lost_reason: lostReason || undefined,
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="crm-info">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <FormattedMessage id="contacts.modal.crm_section" defaultMessage="CRM & Lead Details" />
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="leadStatus">
                      <FormattedMessage id="contacts.modal.status_label" defaultMessage="Lead Status" />
                    </Label>
                    <Select value={leadStatus} onValueChange={setLeadStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="leadSource">
                      <FormattedMessage id="contacts.modal.source_label" defaultMessage="Source" />
                    </Label>
                    <Select value={leadSource} onValueChange={setLeadSource}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="import">Import</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="company">
                      <FormattedMessage id="contacts.modal.company_label" defaultMessage="Company" />
                    </Label>
                    <Input
                      id="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="jobTitle">
                      <FormattedMessage id="contacts.modal.job_title_label" defaultMessage="Job Title" />
                    </Label>
                    <Input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Manager"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dealValue">
                      <FormattedMessage id="contacts.modal.deal_value_label" defaultMessage="Deal Value (Est.)" />
                    </Label>
                    <Input
                      id="dealValue"
                      type="number"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="nextFollowUp">
                      <FormattedMessage id="contacts.modal.follow_up_label" defaultMessage="Next Follow Up" />
                    </Label>
                    <Input
                      id="nextFollowUp"
                      type="datetime-local"
                      value={nextFollowUp}
                      onChange={(e) => setNextFollowUp(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full address..."
                    className="min-h-[60px]"
                  />
                </div>

                {leadStatus === 'lost' && (
                  <div className="grid gap-2">
                    <Label htmlFor="lostReason" className="text-destructive">
                      <FormattedMessage id="contacts.modal.lost_reason_label" defaultMessage="Lost Reason *" />
                    </Label>
                    <Textarea
                      id="lostReason"
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      placeholder="Why was this deal lost?"
                      className="border-destructive/50"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
    </Dialog >
  );
}