# XalesIn WhatsApp Automation - Project Overview

## Project Description

XalesIn is a local-first WhatsApp automation application built with Electron, React, TypeScript, and Vite. The application runs WhatsApp automation fully on the user's device via `@whiskeysockets/baileys` and Puppeteer, while using Supabase for authentication, metadata, and quota management. The core principle is that runtime and assets execute locally, with Supabase acting only as a meta disk, quota enforcer, and optional sync source.

## Architecture & Tech Stack

### Frontend
- **Electron** - Cross-platform desktop application framework
- **Vite** - Fast build tool and development server with HMR
- **React 19** - Modern React with latest features
- **TypeScript 5** - Type-safe development
- **Tailwind CSS 4** - Utility-first CSS framework
- **shadcn/ui** - High-quality, accessible UI components
- **Framer Motion** - Smooth animations and micro-interactions

### Backend Integration
- **Supabase Auth** - Email/Password authentication
- **Supabase Postgres** - Metadata storage and quota management
- **Supabase Storage** - Asset backup and synchronization
- **Row Level Security (RLS)** - Per-user data isolation

### Core Libraries
- **React Query** - Data fetching and caching
- **React Hook Form + Zod** - Form handling with validation
- **Dexie.js** - IndexedDB for local data storage
- **Lucide React** - Beautiful, consistent icons
- **Recharts** - Data visualization
- **Zustand** - Lightweight state management
- **@whiskeysockets/baileys** - WhatsApp Web API client
- **Puppeteer** - Browser automation for WhatsApp Web

## Key Features

### Current Capabilities (Phase 1 - Complete)
- **Responsive Dashboard** - Clean, intuitive interface
- **Contact Management** - Organize and manage WhatsApp contacts
- **Message Templates** - Create and reuse message templates
- **Asset Management** - Handle images, documents, and media
- **Send History** - Track and review sent messages
- **Settings Panel** - Configure app preferences and PIN security
- **Modern UI** - shadcn/ui components with smooth animations

### Backend Integration (Phase 2 - 85% Complete)
- Complete Supabase schema (all tables, RLS, RPC functions)
- Full service layer implementation (local + remote)
- Local security enforcement (RLS equivalent)
- Sophisticated sync system with conflict resolution
- Auth flow integration
- Quota management (local + remote)
- Payment tracking (UI + backend)

### WhatsApp Runtime (Phase 3 - Planned)
- Integrate Puppeteer + WhatsApp-web.js
- Implement State Machine for automation
- Add real send capabilities with progress tracking
- Polish UI with error states and offline handling
- Performance optimization and cleanup

## Project Structure

```
src/
├── components/              # React components
│   ├── pages/              # Page-level components
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   ├── LoginPage.tsx   # Authentication page
│   │   ├── ContactsPage.tsx # Contact management
│   │   ├── SendPage.tsx    # Message composition
│   │   ├── TemplatesPage.tsx # Template management
│   │   ├── HistoryPage.tsx # Send history
│   │   ├── SettingsPage.tsx # App settings
│   │   └── AssetPage.tsx   # Asset management
│   └── ui/                 # shadcn/ui components
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions
│   ├── db.ts              # Database utilities (Dexie)
│   ├── supabase.ts        # Supabase client
│   ├── utils.ts           # General utilities
│   ├── services/          # Data services (mock → real)
│   ├── sync/              # Synchronization system
│   └── security/          # Security utilities
├── main/                   # Electron main process
│   ├── main.ts            # Main process entry point
│   ├── preload.ts         # IPC bridge
│   ├── WhatsAppManager.ts # WhatsApp client manager
│   ├── MessageProcessor.ts # Message processing state machine
│   └── ipcHandlers.ts     # IPC handlers
├── App.tsx                 # Main application component
├── main.tsx               # Application entry point
└── globals.css            # Global styles and Tailwind
```

## Building and Running

### Prerequisites
- **Node.js** 18+ and npm/yarn
- **Git** for version control

### Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

3. **Start Electron development**
   ```bash
   npm run electron:dev
   ```

4. **Build for production**
   ```bash
   npm run build
   npm run electron:build
   ```

### Available Scripts

```bash
# Development
npm run dev              # Start Vite dev server with HMR
npm run electron:dev     # Start Electron app in development
npm run electron:serve   # Serve Electron app
npm run electron:build   # Build Electron app for production
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint with TypeScript support
```

## Security & Privacy

### Local-First Data Handling
- All runtime data stored locally - No sensitive information sent to servers
- IndexedDB for local storage with encryption
- JWT tokens in secure storage using platform-appropriate secure storage
- Complete uninstall cleanup with no residual data left behind

### Supabase Integration (Metadata Only)
- Authentication tokens with secure JWT-based auth
- Usage metadata for quota tracking and activity logs
- Optional sync with user-controlled data synchronization
- Row Level Security for complete data isolation per user

### Data Isolation Strategy
```
Per-User Data Directory:
%AppData%/XalesIn/{user_id}/
├── session/              # WhatsApp session data
├── dexie-db/            # Local IndexedDB
└── assets/              # User assets and media
```

## Core Components

### WhatsApp Manager (`src/main/WhatsAppManager.ts`)
- Core WhatsApp client manager using `@whiskeysockets/baileys`
- Handles authentication via LocalAuth strategy
- Manages QR code generation and session persistence
- Implements message sending capabilities (text and media)
- Handles event callbacks (qr, ready, authenticated, disconnected, messages)

### Message Processor (`src/main/MessageProcessor.ts`)
- State machine for processing bulk message jobs
- Handles configurable delays (static/dynamic)
- Implements variable replacement in message templates
- Reports progress via IPC events
- Supports pause/resume/stop operations

### IPC Handlers (`src/main/ipcHandlers.ts`)
- Provides secure communication between renderer and main processes
- Handles WhatsApp connection/disconnection
- Manages message sending operations
- Processes bulk message jobs
- Reports status and progress updates

### Preload Bridge (`src/main/preload.ts`)
- Secure ContextBridge exposing limited API to renderer
- Implements type-safe WhatsApp API interface
- Provides event listeners for QR codes, status changes, and message progress

### Database (`src/lib/db.ts`)
- Dexie.js implementation for IndexedDB storage
- Local-first approach with optional cloud sync
- Complete data isolation per user with master_user_id
- Sophisticated sync system with conflict resolution

### Sync Manager (`src/lib/sync/SyncManager.ts`)
- Dual-sync system (automatic metadata and manual assets)
- Conflict resolution and data integrity
- Optimistic locking for offline capabilities
- WAL (Write-Ahead Log) for crash recovery

## Development Guidelines

### Code Quality
- TypeScript strict mode compliance
- ESLint + Prettier for consistent code formatting
- Component composition for reusable, modular components
- Error boundaries for graceful error handling
- Performance optimization with React.memo, useMemo, useCallback

### Architecture Patterns
- Service abstraction layer for easy migration from mock to real data
- Custom hooks for reusable stateful logic
- Context for global state (user, theme, and app settings)
- Component composition for flexible, reusable UI blocks

## Offline-First Architecture

### Local Data Strategy
- All runtime data stored locally using IndexedDB
- WhatsApp automation runs entirely on user's device
- Optional cloud sync for backup and multi-device access
- Complete uninstall cleanup with no residual data left behind

### Supabase Integration (Metadata Only)
- Authentication tokens with secure JWT-based auth
- Usage metadata for quota tracking and activity logs
- Optional sync with user-controlled data synchronization
- Row Level Security for complete data isolation per user

### Sync Strategies
- 50% Sync Rule: Adaptive sync based on connection speed
- Per-user data isolation using master_user_id
- WAL (Write-Ahead Log) for crash recovery
- Optimistic locking for offline quota reservations

## Post-MVP Policy

After Phase 3 stabilization:
- Halt Electron development
- Create separate Admin Web UI project for future features
- All Supabase changes via MCP workflow (no direct Studio edits)