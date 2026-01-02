import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/lib/services/ServiceContext';
import { ErrorScreen } from '../ui/ErrorScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedCard } from '@/components/ui/animated-card';
import { FadeIn, Stagger } from '@/components/ui/animations';
import { handleServiceError } from '@/lib/utils/errorHandling';
import { Template } from '@/lib/services/types';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Search,
  ArrowLeft
} from 'lucide-react';

export function TemplatesPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const { templateService, isInitialized } = useServices();

  // Original logic states
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI states from Demo
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    variants: ['', '', ''] // Initialize with 3 empty variants
  });

  // Alert Dialog states
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: 'error' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    type: 'error'
  });

  // Original loadTemplates logic
  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // The service is now guaranteed to be initialized by the ServiceProvider
      const data = await templateService.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      const appError = handleServiceError(err, 'loadTemplates');
      setError(appError.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Original initialization logic
  useEffect(() => {
    if (isInitialized) {
      loadTemplates();
    }
  }, [isInitialized, templateService]);

  // Filter templates based on search query
  const filterTemplates = useCallback(() => {
    if (!searchQuery) {
      setFilteredTemplates(templates);
    } else {
      const filtered = templates.filter(template =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.variants.some(variant => variant.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredTemplates(filtered);
    }
  }, [templates, searchQuery]);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchQuery, filterTemplates]);

  // CRUD Operations using original service logic
  const handleCreateTemplate = async () => {
    try {
      // Filter non-empty variants
      const validVariants = formData.variants.filter(variant => variant.trim() !== '');

      // Validate minimum 3 variants
      if (validVariants.length < 3) {
        setAlertDialog({
          isOpen: true,
          title: intl.formatMessage({ id: 'templates.dialog.validation.title', defaultMessage: 'Validation Error' }),
          description: intl.formatMessage({ id: 'templates.dialog.validation.desc', defaultMessage: 'Template must have at least 3 non-empty variants' }),
          type: 'error'
        });
        return;
      }

      // Extract variables from all variants using service method
      const allVariables = templateService.extractVariablesFromVariants(validVariants);

      const newTemplate = await templateService.createTemplate({
        name: formData.name,
        variants: validVariants,
        variables: allVariables,
        master_user_id: '', // Will be set by service
        created_by: '', // Will be set by service
        category: 'general'
      });

      setTemplates([...templates, newTemplate]);
      setFormData({ name: '', variants: ['', '', ''] });
      setIsCreateDialogOpen(false);
    } catch (err) {
      console.error('Failed to create template:', err);
      const appError = handleServiceError(err, 'createTemplate');
      setAlertDialog({
        isOpen: true,
        title: intl.formatMessage({ id: 'common.status.error', defaultMessage: 'Error' }),
        description: appError.message,
        type: 'error'
      });
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      // Filter non-empty variants
      const validVariants = formData.variants.filter(variant => variant.trim() !== '');

      // Validate minimum 3 variants
      if (validVariants.length < 3) {
        setAlertDialog({
          isOpen: true,
          title: intl.formatMessage({ id: 'templates.dialog.validation.title', defaultMessage: 'Validation Error' }),
          description: intl.formatMessage({ id: 'templates.dialog.validation.desc', defaultMessage: 'Template must have at least 3 non-empty variants' }),
          type: 'error'
        });
        return;
      }

      // Extract variables from all variants using service method
      const allVariables = templateService.extractVariablesFromVariants(validVariants);

      const updatedTemplate = await templateService.updateTemplate(selectedTemplate.id, {
        name: formData.name,
        variants: validVariants,
        variables: allVariables,
        category: selectedTemplate.category || 'general'
      });

      setTemplates(templates.map(t => t.id === selectedTemplate.id ? updatedTemplate : t));
      setFormData({ name: '', variants: ['', '', ''] });
      setSelectedTemplate(null);
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error('Failed to update template:', err);
      const appError = handleServiceError(err, 'updateTemplate');
      setAlertDialog({
        isOpen: true,
        title: intl.formatMessage({ id: 'common.status.error', defaultMessage: 'Error' }),
        description: appError.message,
        type: 'error'
      });
    }
  };

  const handleDeleteTemplate = (templateId: string) => {
    setAlertDialog({
      isOpen: true,
      title: intl.formatMessage({ id: 'templates.dialog.delete.title', defaultMessage: 'Delete Template' }),
      description: intl.formatMessage({ id: 'templates.dialog.delete.desc', defaultMessage: 'Are you sure you want to delete this template? This action cannot be undone.' }),
      type: 'confirm',
      onConfirm: async () => {
        try {
          await templateService.deleteTemplate(templateId);
          setTemplates(templates.filter(t => t.id !== templateId));
        } catch (err) {
          console.error('Failed to delete template:', err);
          const appError = handleServiceError(err, 'deleteTemplate');
          setAlertDialog({
            isOpen: true,
            title: intl.formatMessage({ id: 'common.status.error', defaultMessage: 'Error' }),
            description: appError.message,
            type: 'error'
          });
        }
      }
    });
  };

  const openEditDialog = (template: Template) => {
    setSelectedTemplate(template);
    // Ensure we have at least 3 variants, fill with empty strings if needed
    const variants = [...template.variants];
    while (variants.length < 3) {
      variants.push('');
    }

    setFormData({
      name: template.name,
      variants: variants
    });
    setIsEditDialogOpen(true);
  };

  // Original error handling
  if (error) {
    return <ErrorScreen error={error} onRetry={loadTemplates} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <FadeIn>
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {intl.formatMessage({ id: 'common.button.back', defaultMessage: 'Back' })}
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{intl.formatMessage({ id: 'templates.title', defaultMessage: 'Templates' })}</h1>
                <p className="text-gray-600">{intl.formatMessage({ id: 'templates.subtitle', defaultMessage: 'Create and manage message templates' })}</p>
              </div>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <AnimatedButton animation="scale">
                  <Plus className="h-4 w-4 mr-2" />
                  {intl.formatMessage({ id: 'templates.button.create', defaultMessage: 'New Template' })}
                </AnimatedButton>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>{intl.formatMessage({ id: 'templates.modal.title.create', defaultMessage: 'Create New Template' })}</DialogTitle>
                  <DialogDescription>
                    {intl.formatMessage({ id: 'templates.modal.desc.create', defaultMessage: 'Create a reusable message template with variables' })}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  <div>
                    <Label htmlFor="template-name">{intl.formatMessage({ id: 'templates.form.name.label', defaultMessage: 'Template Name' })}</Label>
                    <Input
                      id="template-name"
                      placeholder={intl.formatMessage({ id: 'templates.form.name.placeholder', defaultMessage: 'Enter template name' })}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  {formData.variants.map((variant, index) => (
                    <div key={index}>
                      <Label htmlFor={`template-variant-${index}`}>{intl.formatMessage({ id: 'templates.form.variant.label', defaultMessage: 'Variant {number}' }, { number: index + 1 })}</Label>
                      <Textarea
                        id={`template-variant-${index}`}
                        placeholder={intl.formatMessage({ id: 'templates.form.variant.placeholder', defaultMessage: 'Enter variant {number} message content. Support: {{name}}, {{phone}}, {{notes}}. Use {{key}} for other custom fields.' }, { number: index + 1 })}
                        value={variant}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index] = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        rows={4}
                        className="max-w-full resize-y overflow-y-auto break-words"
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          maxWidth: '100%',
                          minHeight: '100px',
                          maxHeight: '200px',
                          overflowY: 'auto'
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {intl.formatMessage({ id: 'templates.form.help', defaultMessage: 'Use double curly braces for dynamic content. Supported: {{name}}, {{phone}}, {{notes}}. Custom fields (e.g., {{company}}) are also supported if they exist in contact details. Each variant provided enables message randomization.' })}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    {intl.formatMessage({ id: 'common.button.cancel', defaultMessage: 'Cancel' })}
                  </Button>
                  <AnimatedButton
                    animation="scale"
                    onClick={handleCreateTemplate}
                    disabled={!formData.name || formData.variants.filter(v => v.trim() !== '').length < 3}
                  >
                    {intl.formatMessage({ id: 'templates.button.create_action', defaultMessage: 'Create Template' })}
                  </AnimatedButton>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <AnimatedCard animation="fadeIn" delay={0.2} className="mb-6">
            <CardHeader>
              <CardTitle>{intl.formatMessage({ id: 'templates.search.title', defaultMessage: 'Search Templates' })}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={intl.formatMessage({ id: 'templates.search.placeholder', defaultMessage: 'Search templates by name or content...' })}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* Templates Grid */}
          {isLoading ? (
            <div className="text-center py-8">{intl.formatMessage({ id: 'common.status.loading', defaultMessage: 'Loading...' })}</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery
                ? intl.formatMessage({ id: 'templates.empty.search', defaultMessage: 'No templates found matching your search.' })
                : intl.formatMessage({ id: 'templates.empty.all', defaultMessage: 'No templates created yet.' })
              }
            </div>
          ) : (
            <Stagger staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <AnimatedCard key={template.id} animation="slideUp" delay={0.1}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
                        <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                      </div>
                      <div className="flex space-x-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Minimal card content - only showing template name */}
                  </CardContent>
                </AnimatedCard>
              ))}
            </Stagger>
          )}

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>{intl.formatMessage({ id: 'templates.modal.title.edit', defaultMessage: 'Edit Template' })}</DialogTitle>
                <DialogDescription>
                  {intl.formatMessage({ id: 'templates.modal.desc.edit', defaultMessage: 'Update your message template' })}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                <div>
                  <Label htmlFor="edit-template-name">{intl.formatMessage({ id: 'templates.form.name.label', defaultMessage: 'Template Name' })}</Label>
                  <Input
                    id="edit-template-name"
                    placeholder={intl.formatMessage({ id: 'templates.form.name.placeholder', defaultMessage: 'Enter template name' })}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                {formData.variants.map((variant, index) => (
                  <div key={index}>
                    <Label htmlFor={`edit-template-variant-${index}`}>{intl.formatMessage({ id: 'templates.form.variant.label', defaultMessage: 'Variant {number}' }, { number: index + 1 })}</Label>
                    <Textarea
                      id={`edit-template-variant-${index}`}
                      placeholder={intl.formatMessage({ id: 'templates.form.variant.placeholder', defaultMessage: 'Enter variant {number} message content. Support: {{name}}, {{phone}}, {{notes}}. Use {{key}} for other custom fields.' }, { number: index + 1 })}
                      value={variant}
                      onChange={(e) => {
                        const newVariants = [...formData.variants];
                        newVariants[index] = e.target.value;
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      rows={4}
                      className="max-w-full resize-y overflow-y-auto break-words"
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                        minHeight: '100px',
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }}
                    />
                  </div>
                ))}
                <div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {intl.formatMessage({ id: 'templates.form.help', defaultMessage: 'Use double curly braces for dynamic content. Supported: {{name}}, {{phone}}, {{notes}}. Custom fields (e.g., {{company}}) are also supported if they exist in contact details. Each variant provided enables message randomization.' })}
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {intl.formatMessage({ id: 'common.button.cancel', defaultMessage: 'Cancel' })}
                </Button>
                <AnimatedButton
                  animation="scale"
                  onClick={handleUpdateTemplate}
                  disabled={!formData.name || formData.variants.filter(v => v.trim() !== '').length < 3}
                >
                  {intl.formatMessage({ id: 'templates.button.update', defaultMessage: 'Update Template' })}
                </AnimatedButton>
              </div>
            </DialogContent>
          </Dialog>

          {/* Alert Dialog */}
          <AlertDialog open={alertDialog.isOpen} onOpenChange={(isOpen) => setAlertDialog({ ...alertDialog, isOpen })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{alertDialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{alertDialog.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {alertDialog.type === 'confirm' ? (
                  <>
                    <AlertDialogCancel>{intl.formatMessage({ id: 'common.button.cancel', defaultMessage: 'Cancel' })}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        alertDialog.onConfirm?.();
                        setAlertDialog({ ...alertDialog, isOpen: false });
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {intl.formatMessage({ id: 'common.button.delete', defaultMessage: 'Delete' })}
                    </AlertDialogAction>
                  </>
                ) : (
                  <AlertDialogAction onClick={() => setAlertDialog({ ...alertDialog, isOpen: false })}>
                    {intl.formatMessage({ id: 'common.button.ok', defaultMessage: 'OK' })}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </FadeIn>
      </div>
    </div>
  );
}