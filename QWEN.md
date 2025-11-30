# Xender-In WhatsApp Automation - Project Context

## Project Overview

**Xender-In** is a local-first WhatsApp automation application built with Electron, React, TypeScript, and Vite. The app runs WhatsApp automation fully on the user's device via `whatsapp-web.js` and Puppeteer, while using Supabase only for authentication, metadata, and quota management. The core principle is that runtime and assets execute locally, with Supabase acting only as a meta disk, quota enforcer, and optional sync source.

### Technology Stack
- **Desktop Framework**: Electron
- **Frontend**: Vite + React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn/ui + Animate UI components
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Local Database**: Dexie.js (IndexedDB wrapper)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Form Handling**: React Hook Form + Zod
- **WhatsApp Runtime**: whatsapp-web.js + Puppeteer

### Architecture Principles
1. **Local-First Execution**: All runtime operations happen locally; Supabase is metadata storage only
2. **Supabase as Meta-Disk**: Supabase manages quotas, payments, auth, and cross-device sync
3. **Data Isolation**: Per-user isolation with master_user_id scoping via RLS
4. **Phased Development**: UI → Backend → WhatsApp runtime progression

## Development Phases

### Phase 1: UI-First MVP ✅ COMPLETE
- Complete user flow: Login → PIN → Dashboard → Contact Management
- All pages implemented with mock data services
- Responsive design with shadcn/ui components
- Service abstraction layer ready for real data integration

### Phase 2: Backend Integration 🟢 85% COMPLETE
- Complete Supabase schema with RLS policies and RPC functions
- Full service layer with local + Supabase integration
- Sophisticated sync system with conflict resolution
- Auth flow and quota management
- Payment integration with DUITKU

### Phase 3: WhatsApp Runtime 🔄 IN PROGRESS (Week 2 of 4)
- **Status**: Week 1 infrastructure setup (Electron main process, IPC, dependencies) is COMPLETE
- **Current Focus**: Week 2 - WhatsApp Core (Worker 1: WhatsAppManager and Worker 3: IPC Handlers)
- **Implementation**: Integrate whatsapp-web.js and Puppeteer for actual message sending
- **Architecture**: 8 critical workers being implemented in sequence:
  1. **WhatsAppManager** - Core WhatsApp client with authentication and message sending
  2. **MessageProcessor** - State machine for bulk message processing
  3. **IPC Handlers** - Communication between renderer and main process
  4. **Preload Bridge** - Secure API exposure to renderer process
  5. **QueueWorker** - Job queue management
  6. **SendWorker** - Execute actual message sending with template processing
  7. **StatusWorker** - Connection monitoring and auto-reconnect
  8. **MessageReceiverWorker** ⭐ - NEW: Bidirectional messaging with unsubscribe detection
- **Key Addition**: MessageReceiverWorker (8th worker) added for bidirectional messaging, unsubscribe detection, and future features (auto-reply, chatbot, analytics)
- **Timeline**: 4-week timeline with workers implemented sequentially

## Project Structure

```
xender-in/
├── src/
│   ├── components/
│   │   ├── pages/           # All page components (LoginPage, Dashboard, etc.)
│   │   └── ui/              # shadcn/ui components
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   ├── db.ts            # Dexie schema
│   │   ├── supabase.ts      # Supabase client
│   │   ├── migrations/      # Local DB migrations
│   │   ├── security/        # Security layer
│   │   │   ├── LocalSecurityService.ts
│   │   │   ├── UserContextManager.ts
│   │   │   └── SecurityTests.ts
│   │   ├── services/        # Service layer
│   │   │   ├── AuthService.ts
│   │   │   ├── QuotaService.ts
│   │   │   ├── LocalQuotaService.ts
│   │   │   ├── PaymentService.ts
│   │   │   ├── ContactService.ts
│   │   │   ├── GroupService.ts
│   │   │   ├── TemplateService.ts
│   │   │   ├── HistoryService.ts
│   │   │   ├── AssetService.ts
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   ├── sync/
│   │   │   └── SyncManager.ts
│   │   └── utils/
│   ├── main.tsx             # React app entry point
│   └── App.tsx              # Main application component
├── src/main/                # Electron main process (NEW - Week 1 setup)
│   ├── main.ts              # Electron main process entry point
│   ├── preload.ts           # Electron preload script with IPC bridge
│   ├── ipcHandlers.ts       # IPC communication handlers
│   ├── WhatsAppManager.ts   # Core WhatsApp client (Phase 3)
│   ├── MessageProcessor.ts  # Message processing state machine (Phase 3)
│   ├── workers/             # WhatsApp worker implementations (Phase 3)
│   │   ├── QueueWorker.ts
│   │   ├── SendWorker.ts
│   │   ├── StatusWorker.ts
│   │   └── MessageReceiverWorker.ts  # NEW: Bidirectional messaging
│   └── utils/               # Main process utilities
│       ├── logger.ts
│       └── retry.ts
├── supabase/
│   ├── migrations/          # Database migrations
│   ├── functions/           # Edge Functions
│   └── config.toml
├── Plan/                    # Architecture and planning documents
├── package.json
├── vite.config.ts
├── electron-builder.yml     # Electron build configuration
└── README.md
```

## Key Features

### Current Capabilities (Phase 1-2)
- Responsive Dashboard with clean, intuitive interface
- Contact management with search and filter
- Message templates with CRUD operations
- Asset management for images, documents, and media
- Send history tracking and activity logs
- Settings panel with app preferences and PIN security
- Modern UI with shadcn/ui components and smooth animations
- Complete service layer with offline-first approach
- Sophisticated sync system with conflict resolution
- Authentication with Supabase
- Quota management and payment processing

### Current Capabilities (Phase 3 - In Progress)
- **Electron Infrastructure**: Complete Electron main process setup (Week 1)
- **WhatsApp Integration**: Core WhatsApp client with authentication and message sending (Week 2)
- **Bidirectional Messaging**: NEW - Receive incoming messages and detect unsubscribe requests (Week 4)
- **8-Worker Architecture**: Comprehensive background processing system
- **Real-time Progress**: Live job progress tracking
- **Auto-reconnect**: Connection monitoring and recovery
- **Unsubscribe Detection**: Automated whitelist management for compliance
- **Template Processing**: Dynamic variable replacement in messages

### Planned Features (Future Development)
- Secure authentication with Supabase Auth
- WhatsApp automation via Puppeteer
- Data synchronization with optional cloud backup
- Quota management and usage tracking
- Offline support with full functionality
- Per-user secure data storage with complete uninstall cleanup
- Auto-reply system for customer service
- Chatbot integration for automation
- Message analytics dashboard
- Customer support ticketing

## Critical Issues to Address

1. **Missing Supabase Client Package**: The `@supabase/supabase-js` package was previously referenced in code but not installed in package.json (RESOLVED: Already installed v2.81.1 as of Week 1 setup)
2. **Template Schema Mismatch**: Differences between Supabase (content TEXT) and Dexie (variants string[]) schemas (RESOLVED: Schema aligned in Week 1)
3. **Missing Edge Functions**: Payment Edge Functions not yet deployed (webhook handlers)
4. **No Testing Infrastructure**: No automated tests implemented yet
5. **Electron Main Process**: Previously missing, now being implemented in Phase 3

## Recent Changes

1. **Database Schema Fix**: Added `master_user_id` index to `messageJobs` table in database version 7 to fix logout error
2. **Login Flow Enhancement**: Database is now cleared completely when users click the LOGIN or REGISTER buttons, before the authentication flow begins, with proper fallback handling if database cleanup fails
3. **LoginPage Import Fix**: Added missing `db` import to LoginPage.tsx to fix "db is not defined" error that occurred during login database clearing
4. **Phase 3 Infrastructure Setup (Week 1)**:
   - Electron main process structure created (`src/main/main.ts`, `src/main/preload.ts`, `src/main/ipcHandlers.ts`)
   - Dependencies installed (`electron`, `electron-builder`, `whatsapp-web.js`, `puppeteer`, `@supabase/supabase-js`)
   - Build system configured (`vite.config.ts`, `package.json`, `electron-builder.yml`)
   - Electron window launches successfully with React app inside
   - IPC skeleton ready for WhatsApp integration

## Building and Running

### Prerequisites
- Node.js 18+ and npm/yarn
- Git for version control

### Installation and Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. For Electron development:
   ```bash
   npm run electron:dev
   ```

4. For production build:
   ```bash
   npm run electron:build
   ```

### Available Scripts
- `npm run dev` - Start Vite dev server with HMR
- `npm run build` - Build for production
- `npm run electron:dev` - Start Electron dev server
- `npm run electron:build` - Build Electron app for distribution
- `npm run lint` - Run ESLint with TypeScript support
- `npm run preview` - Preview production build

## Security & Data Isolation

### Local-First Data Handling
- All runtime data stored locally with no sensitive info sent to servers
- IndexedDB for local storage with Dexie.js
- JWT tokens in secure storage using Keytar
- Complete uninstall cleanup with no residual data left behind

### Supabase Integration (Metadata Only)
- Authentication tokens via secure JWT-based auth
- Usage metadata for quota tracking and activity logs
- Optional sync with user-controlled data synchronization
- Row Level Security for complete data isolation per user

### Data Isolation Strategy
Per-user data directory structure:
```
%AppData%/Xender-In/{user_id}/
├── session/              # WhatsApp session data
├── dexie-db/            # Local IndexedDB
└── assets/              # User assets and media
```

## Key Files

### Configuration
- `vite.config.ts` - Vite configuration with Electron integration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `electron-builder.yml` - Electron builder configuration

### Core Logic
- `src/lib/db.ts` - Dexie database schema with 6 versions and local security features
- `src/App.tsx` - Main application component with authentication flow
- `src/main.tsx` - React app entry point
- `src/main/main.ts` - Electron main process entry point
- `src/main/preload.ts` - Electron preload script with IPC bridge
- `src/main/WhatsAppManager.ts` - Core WhatsApp client (Phase 3)
- `src/main/MessageProcessor.ts` - Message processing state machine (Phase 3)
- `src/main/ipcHandlers.ts` - IPC communication handlers (Phase 3)
- `src/lib/services/types.ts` - TypeScript interfaces for all entities

## Development Guidelines

### Code Quality
- TypeScript strict mode enabled
- ESLint + Prettier for consistent formatting
- No `any` types without justification
- Functional components + hooks only
- Consistent error handling with try/catch

### Architecture
- Service abstraction layer allows easy migration from mock to real data
- Custom hooks for reusable stateful logic
- Context for global state management (User, theme, app settings)
- Component composition with flexible, reusable UI blocks
- Local RLS enforcement via LocalSecurityService
- Sophisticated bidirectional sync system with conflict resolution
- 8-worker architecture for WhatsApp integration (main process)
- Secure IPC communication between renderer and main process
- Bidirectional messaging with unsubscribe detection
- Local-first execution with Supabase as meta-disk