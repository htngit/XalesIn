# Component Architecture - Xender-In Next.js Website

## Next.js Application Structure

### App Directory Structure
```
src/
├── app/
│   ├── layout.tsx              # Root layout with global styles
│   ├── page.tsx                # Home/Dashboard page
│   ├── login/
│   │   ├── page.tsx            # Login page
│   │   └── components/
│   ├── dashboard/
│   │   ├── page.tsx            # Dashboard page
│   │   └── components/
│   ├── contacts/
│   │   ├── page.tsx            # Contacts management
│   │   └── components/
│   ├── templates/
│   │   ├── page.tsx            # Template management
│   │   └── components/
│   ├── campaigns/
│   │   ├── page.tsx            # Campaign management
│   │   └── components/
│   ├── history/
│   │   ├── page.tsx            # History and analytics
│   │   └── components/
│   ├── assets/
│   │   ├── page.tsx            # Asset management
│   │   └── components/
│   ├── settings/
│   │   ├── page.tsx            # Settings page
│   │   └── components/
│   └── api/
│       └── [...nextauth]/
│           └── route.ts        # NextAuth API routes
├── components/
│   ├── ui/                     # Reusable UI components (shadcn/ui)
│   ├── pages/                  # Page-specific components
│   └── settings/               # Settings-related components
├── lib/
│   ├── supabase.ts            # Supabase client and helpers
│   ├── db.ts                  # Dexie database implementation
│   ├── utils.ts               # Utility functions
│   ├── services/              # Business logic services
│   └── hooks/                 # Custom React hooks
├── hooks/                     # Custom React hooks
├── providers/                 # Context providers
└── types/                     # TypeScript type definitions
```

## Core Component Categories

### UI Components (shadcn/ui based)
- **Button**: Action triggers with variants (primary, secondary, destructive)
- **Card**: Content containers with header, body, and footer sections
- **Input**: Form inputs with validation support
- **DataTable**: Tabular data display with sorting and filtering
- **Dialog**: Modal dialogs for confirmations and forms
- **Tabs**: Tabbed interfaces for content organization
- **Navigation**: Sidebar and top navigation components
- **Form Components**: Input, textarea, select, checkbox, radio group
- **Data Display**: Badge, avatar, tooltip, popover
- **Feedback**: Alert, toast, loading indicators

### Page Components
- **LoginPage**: Authentication interface with email/password
- **DashboardPage**: Main dashboard with analytics and quick actions
- **ContactsPage**: Contact management with import/export functionality
- **TemplatesPage**: Message template creation and management
- **CampaignPage**: Campaign configuration and execution interface
- **HistoryPage**: Campaign history and analytics dashboard
- **AssetsPage**: Media asset upload and management
- **SettingsPage**: User settings and preferences

### Service Components
- **AuthService**: Authentication and session management
- **ContactService**: Contact management and import/export
- **TemplateService**: Template creation and variable management
- **CampaignService**: Campaign configuration and execution
- **HistoryService**: History tracking and analytics
- **AssetService**: Asset upload and management
- **QuotaService**: Quota management and reservation
- **SyncService**: Data synchronization between local and remote

## Data Management Components

### Local Database (Dexie.js)
- **AppDatabase**: Main Dexie database instance with schema definition
- **Contact Model**: Local contact storage with sync metadata
- **Template Model**: Local template storage with sync metadata
- **Group Model**: Contact group management
- **ActivityLog Model**: Local activity tracking
- **Asset Model**: Local asset metadata storage
- **Quota Model**: Local quota information
- **SyncQueue Model**: Pending sync operations

### Supabase Integration Components
- **SupabaseClient**: Main Supabase client instance
- **AuthHelpers**: Authentication-related functions
- **RPC Helpers**: Quota management and business logic functions
- **Database Error Handler**: Centralized error handling

## State Management Architecture

### Global State (Zustand)
- **AuthStore**: Authentication state and user information
- **ContactStore**: Contact management state
- **TemplateStore**: Template management state
- **CampaignStore**: Campaign configuration and execution state
- **AssetStore**: Asset management state
- **UIStore**: UI state like loading indicators, modals

### Local State (React Hooks)
- **Form State**: Managed by React Hook Form
- **Component State**: Local to individual components
- **Data Fetching State**: Managed by React Query

## Service Layer Components

### Business Logic Services
```
src/lib/services/
├── AuthService.ts          # Authentication logic
├── ContactService.ts       # Contact management
├── TemplateService.ts      # Template management
├── CampaignService.ts      # Campaign logic
├── HistoryService.ts       # History and analytics
├── AssetService.ts         # Asset management
├── QuotaService.ts         # Quota management
├── SyncService.ts          # Data synchronization
├── WhatsAppService.ts      # WhatsApp integration
└── PaymentService.ts       # Payment processing
```

### Core Service Interfaces
```typescript
// ContactService interface
interface ContactService {
  importContacts(file: File): Promise<Contact[]>;
  getContacts(groupId?: string): Promise<Contact[]>;
  createContact(contact: Contact): Promise<Contact>;
  updateContact(id: string, contact: Partial<Contact>): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  syncContacts(): Promise<void>;
}

// TemplateService interface
interface TemplateService {
  getTemplates(): Promise<Template[]>;
  createTemplate(template: Template): Promise<Template>;
  updateTemplate(id: string, template: Partial<Template>): Promise<Template>;
  deleteTemplate(id: string): Promise<void>;
  validateTemplate(template: Template): ValidationResult;
  syncTemplates(): Promise<void>;
}

// CampaignService interface
interface CampaignService {
  createCampaign(config: CampaignConfig): Promise<Campaign>;
  executeCampaign(campaignId: string): Promise<CampaignResult>;
  scheduleCampaign(campaign: Campaign): Promise<ScheduledCampaign>;
  getCampaignHistory(): Promise<CampaignHistory[]>;
  cancelCampaign(campaignId: string): Promise<void>;
}
```

## Component Communication Patterns

### Context Providers
- **AuthProvider**: Provides authentication state to the application
- **DatabaseProvider**: Provides database instances to components
- **ThemeProvider**: Manages application theme (light/dark mode)
- **SyncProvider**: Manages synchronization state and operations

### Event Handling
- **Custom Events**: For communication between components
- **Pub/Sub Pattern**: For decoupled component communication
- **Callback Props**: For parent-child communication

## Security Components

### Authentication Components
- **ProtectedRoute**: Higher-order component for route protection
- **AuthWrapper**: Authentication state management
- **SessionManager**: Session handling and refresh logic

### Authorization Components
- **PermissionGate**: Component-level permission checking
- **RoleBasedAccess**: Role-based UI element visibility

## Responsive Design Components

### Layout Components
- **ResponsiveSidebar**: Collapsible sidebar for mobile
- **AdaptiveGrid**: Grid layouts that adapt to screen size
- **MobileNavigation**: Mobile-specific navigation patterns

### Device-Specific Components
- **DesktopOnly**: Components only visible on desktop
- **MobileOnly**: Components only visible on mobile
- **ResponsiveModal**: Modals that adapt to screen size

## Internationalization Components

### Translation Components
- **Trans**: Translation component for text
- **NumberFormat**: Locale-aware number formatting
- **DateFormat**: Locale-aware date formatting

### Language Management
- **LanguageSwitcher**: UI for language selection
- **LocaleProvider**: Provides current locale to components

## Performance Optimization Components

### Lazy Loading
- **LazyDataTable**: Lazy-loaded data tables
- **Code Splitting Components**: Route-based code splitting

### Caching Components
- **CachedImage**: Image component with caching
- **MemoizedList**: Optimized list rendering

## Error Handling Components

### Error Boundaries
- **AppErrorBoundary**: Top-level error boundary
- **ComponentErrorBoundary**: Component-specific error boundaries

### Error Display
- **ErrorScreen**: Full-screen error display
- **ErrorToast**: Notification-based error display
- **FallbackComponent**: Fallback UI for failed components

## Testing Architecture

### Component Testing
- **Test Providers**: Mock providers for component testing
- **Test Utilities**: Helper functions for testing
- **Mock Services**: Mock implementations of services

### Integration Testing
- **API Mocks**: Mock API responses
- **Database Mocks**: Mock database operations
- **Authentication Mocks**: Mock authentication state