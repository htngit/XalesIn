import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedCard } from '@/components/ui/animated-card';
import { FadeIn, Stagger } from '@/components/ui/animations';
import { TemplateService, Template } from '@/lib/services';
import { userContextManager } from '@/lib/security/UserContextManager';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Search,
  Variable,
  ArrowLeft,
  Eye,
  Copy
} from 'lucide-react';

export function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    variants: ['', '', ''] // Initialize with 3 empty variants
  });

  const templateService = new TemplateService();

  // Wait for user context to be initialized before loading templates
  useEffect(() => {
    const checkUserContext = async () => {
      const user = await userContextManager.getCurrentUser();
      if (user) {
        loadTemplates();
      }
    };

    checkUserContext();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await templateService.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleCreateTemplate = async () => {
    try {
      // Filter non-empty variants
      const validVariants = formData.variants.filter(variant => variant.trim() !== '');
      
      // Validate minimum 3 variants
      if (validVariants.length < 3) {
        alert('Template must have at least 3 non-empty variants');
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
    } catch (error) {
      console.error('Failed to create template:', error);
      alert(error instanceof Error ? error.message : 'Failed to create template');
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      // Filter non-empty variants
      const validVariants = formData.variants.filter(variant => variant.trim() !== '');
      
      // Validate minimum 3 variants
      if (validVariants.length < 3) {
        alert('Template must have at least 3 non-empty variants');
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
    } catch (error) {
      console.error('Failed to update template:', error);
      alert(error instanceof Error ? error.message : 'Failed to update template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await templateService.deleteTemplate(templateId);
      setTemplates(templates.filter(t => t.id !== templateId));
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{([^}]+)\}/g;
    const matches = content.match(regex);
    return matches ? matches.map(match => match.slice(1, -1)) : [];
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Template copied to clipboard!');
  };

  const previewTemplate = (template: Template) => {
    // Take the first variant for preview
    const preview = template.variants[0];

    // Replace variables with example values
    template.variables?.forEach(variable => {
      const exampleValue = variable.includes('name') ? 'John Doe' :
                         variable.includes('amount') ? '$100' :
                         variable.includes('date') ? 'December 25, 2024' :
                         variable.includes('event') ? 'Product Launch' :
                         variable.includes('location') ? 'Jakarta Convention Center' :
                         variable.includes('product') ? 'Amazing Product' :
                         variable.includes('company') ? 'Your Company' :
                         variable.includes('contact') ? '+62812345678' :
                         `[${variable}]`;

      return preview?.replace(new RegExp(`\\{${variable}\\}`, 'g'), exampleValue) || '';
    });

    return preview || '';
  };

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
                <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
                <p className="text-gray-600">Create and manage message templates</p>
              </div>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <AnimatedButton animation="scale">
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </AnimatedButton>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>Create New Template</DialogTitle>
                  <DialogDescription>
                    Create a reusable message template with variables
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  <div>
                    <Label htmlFor="template-name">Template Name</Label>
                    <Input
                      id="template-name"
                      placeholder="Enter template name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  {formData.variants.map((variant, index) => (
                    <div key={index}>
                      <Label htmlFor={`template-variant-${index}`}>Variant {index + 1}</Label>
                      <Textarea
                        id={`template-variant-${index}`}
                        placeholder={`Enter variant ${index + 1} message content. Use {variable_name} for dynamic content.`}
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
                      Use {'{variable_name}'} for dynamic content (e.g., {'{name}'}, {'{amount}'}, {'{date}'}).
                      Each variant provides a different message version for randomization.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <AnimatedButton
                    animation="scale"
                    onClick={handleCreateTemplate}
                    disabled={!formData.name || formData.variants.filter(v => v.trim() !== '').length < 3}
                  >
                    Create Template
                  </AnimatedButton>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <AnimatedCard animation="fadeIn" delay={0.2} className="mb-6">
            <CardHeader>
              <CardTitle>Search Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates by name or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </AnimatedCard>

          {/* Templates Grid */}
          {isLoading ? (
            <div className="text-center py-8">Loading templates...</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No templates found matching your search.' : 'No templates created yet.'}
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
                  {/* Ultra minimal card - hanya nama template */}
                  <CardContent className="pt-0">
                    {/* Card content kosong - tidak ada preview, badge, atau content lainnya */}
                  </CardContent>
                </AnimatedCard>
              ))}
            </Stagger>
          )}

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Edit Template</DialogTitle>
                <DialogDescription>
                  Update your message template
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                <div>
                  <Label htmlFor="edit-template-name">Template Name</Label>
                  <Input
                    id="edit-template-name"
                    placeholder="Enter template name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                {formData.variants.map((variant, index) => (
                  <div key={index}>
                    <Label htmlFor={`edit-template-variant-${index}`}>Variant {index + 1}</Label>
                    <Textarea
                      id={`edit-template-variant-${index}`}
                      placeholder={`Enter variant ${index + 1} message content. Use {variable_name} for dynamic content.`}
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
                    Use {'{variable_name}'} for dynamic content (e.g., {'{name}'}, {'{amount}'}, {'{date}'}).
                    Each variant provides a different message version for randomization.
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <AnimatedButton
                  animation="scale"
                  onClick={handleUpdateTemplate}
                  disabled={!formData.name || formData.variants.filter(v => v.trim() !== '').length < 3}
                >
                  Update Template
                </AnimatedButton>
              </div>
            </DialogContent>
          </Dialog>
        </FadeIn>
      </div>
    </div>
  );
}