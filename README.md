# 🚀 XalesIn - Local-First WhatsApp Automation App

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0+-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646cff.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.0+-38b2ac.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Enabled-3ecf8e.svg)](https://supabase.com/)

**XalesIn** is a local-first WhatsApp automation application that prioritizes user privacy and data control. The app runs WhatsApp automation fully on the user's device while using Supabase only for authentication, metadata, and quota management.

---

## 📚 **Documentation**

| Document | Purpose | Status |
|----------|---------|--------|
| **[PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md)** | 📊 **Complete project status, roadmap, architecture compliance, and action items** | ✅ **PRIMARY DOC** |
| **[Architecture_WhatsappAutomation.md](./Architecture_WhatsappAutomation.md)** | 🏗️ Core architecture principles and technical stack | ✅ Reference |
| **[DUITKU_INTEGRATION_GUIDE.md](./DUITKU_INTEGRATION_GUIDE.md)** | 💳 Payment gateway integration guide | ✅ Reference |
| **[rules.md](./rules.md)** | 📋 Development standards and coding guidelines | ✅ Reference |
| **README.md** (this file) | 🚀 Quick start and project overview | ✅ You are here |

> 🎯 **Start here**: For comprehensive project understanding, read [PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md) first!

---

## 🎯 Project Overview

XalesIn follows a **local-first architecture** where:
- **Runtime execution** happens locally on the user's device via `whatsapp-web.js` and Puppeteer
- **Supabase** acts as a meta-disk for authentication, metadata, quota control, and activity logging
- **No backend dependency** for core functionality
- **Complete data isolation** per user with secure cleanup

> 🔑 **Core Principle**: Runtime and assets execute locally; Supabase acts only as meta disk, quota enforcer, and optional sync source.

## 🏗️ Architecture & Tech Stack

### Frontend (Current Phase)
- **⚡ Vite** - Fast build tool and development server with HMR
- **⚛️ React 19** - Modern React with latest features
- **📘 TypeScript 5** - Type-safe development
- **🎨 Tailwind CSS 4** - Utility-first CSS framework
- **🧩 shadcn/ui** - High-quality, accessible UI components
- **🎭 Framer Motion** - Smooth animations and micro-interactions
- **📱 Responsive Design** - Mobile-first approach

### Backend Integration
- **🔐 Supabase Auth** - Email/Password authentication
- **🗄️ Supabase Postgres** - Metadata storage and quota management
- **☁️ Supabase Storage** - Asset backup and synchronization
- **🔒 Row Level Security (RLS)** - Per-user data isolation

### Core Libraries
- **🔄 React Query** - Data fetching and caching
- **📝 React Hook Form + Zod** - Form handling with validation
- **💾 Dexie.js** - IndexedDB for local data storage
- **🎨 Lucide React** - Beautiful, consistent icons
- **📊 Recharts** - Data visualization
- **🔧 Zustand** - Lightweight state management

## 🎨 UI/UX Design Philosophy

### Component Strategy
- **shadcn/ui + Animate UI** - Open code model for maximum flexibility
- **Zero runtime overhead** - No wrapper dependencies or styling conflicts
- **Accessible by default** - Built on Radix UI primitives
- **Animation focused** - Framer Motion for meaningful micro-interactions

### Design Principles
- **Mobile-first responsive design**
- **Dark/Light mode support**
- **Consistent visual language**
- **Performance-optimized interactions**
- **Accessibility compliance**

## 🚀 Development Phases

### Phase 1 — UI-First MVP ✅ **COMPLETE**
- **Status**: 100% Complete
- **Features**:
  - Complete user flow: Login → PIN → Dashboard → Contact Management
  - Send message configuration and history tracking
  - Template management and asset handling
  - Settings and user preferences
- **Technology**: React + Vite + shadcn/ui + Animate UI
- **Data**: Mock services with abstraction layer

### Phase 2 — Backend Integration 🟢 **85% COMPLETE** (Current Phase)
- **Status**: Active Development
- **Completed**:
  - ✅ Complete Supabase schema (all tables, RLS, RPC functions)
  - ✅ Full service layer implementation (local + remote)
  - ✅ Local security enforcement (RLS equivalent)
  - ✅ Sophisticated sync system with conflict resolution
  - ✅ Auth flow integration
  - ✅ Quota management (local + remote)
  - ✅ Payment tracking (UI + backend)
- **Remaining**:
  - ⚠️ Install @supabase/supabase-js package
  - ⚠️ Fix template schema mismatch
  - ⚠️ Deploy payment Edge Functions
  - ⚠️ Add testing infrastructure
  - ⚠️ Performance optimization

### Phase 3 — WhatsApp Runtime ⏸️ **PLANNED**
- **Prerequisites**: Complete Phase 2 critical fixes
- **Planned Tasks**:
  - Integrate Puppeteer + WhatsApp-web.js
  - Implement State Machine for automation
  - Add real send capabilities with progress tracking
  - Polish UI with error states and offline handling
  - Performance optimization and cleanup

> 📖 **For detailed project status, roadmap, and implementation details, see [PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md)**

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** 18+ and npm/yarn
- **Git** for version control

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd XalesIn
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:5173
   ```

### Available Scripts

```bash
# Development
npm run dev          # Start Vite dev server with HMR
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint with TypeScript support
```

## 📁 Project Structure

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
│       ├── button.tsx      # Button component variants
│       ├── card.tsx        # Card layouts
│       ├── dialog.tsx      # Modal dialogs
│       ├── input.tsx       # Form inputs
│       ├── animated-button.tsx # Animated interactions
│       └── ...
├── hooks/                  # Custom React hooks
│   ├── use-mobile.ts       # Mobile detection
│   └── use-toast.ts        # Toast notifications
├── lib/                    # Utility functions
│   ├── db.ts              # Database utilities
│   ├── utils.ts           # General utilities
│   └── services/          # Data services (mock → real)
│       ├── AuthService.ts # Authentication logic
│       ├── ContactService.ts # Contact management
│       ├── GroupService.ts # Group management
│       ├── TemplateService.ts # Template handling
│       ├── AssetService.ts # Asset management
│       ├── QuotaService.ts # Quota tracking
│       └── types.ts       # TypeScript interfaces
├── App.tsx                 # Main application component
├── main.tsx               # Application entry point
└── globals.css            # Global styles and Tailwind
```

## 🔧 Key Features

### Current Capabilities (Phase 1)
- **📱 Responsive Dashboard** - Clean, intuitive interface
- **👥 Contact Management** - Organize and manage WhatsApp contacts
- **📨 Message Templates** - Create and reuse message templates
- **📁 Asset Management** - Handle images, documents, and media
- **📊 Send History** - Track and review sent messages
- **⚙️ Settings Panel** - Configure app preferences and PIN security
- **🎨 Modern UI** - shadcn/ui components with smooth animations

### Planned Features (Phase 2-3)
- **🔐 Secure Authentication** - Supabase Auth integration
- **📱 WhatsApp Automation** - Real message sending via Puppeteer
- **☁️ Data Synchronization** - Optional cloud backup and sync
- **📈 Quota Management** - Usage tracking and limits
- **🔄 Offline Support** - Full functionality without internet
- **🛡️ Data Isolation** - Per-user secure data storage

## 🔒 Security & Privacy

### Local-First Data Handling
- **All runtime data stored locally** - No sensitive information sent to servers
- **IndexedDB for local storage** - Fast, encrypted local database
- **JWT tokens in secure storage** - Using platform-appropriate secure storage
- **Complete uninstall cleanup** - No residual data left behind

### Supabase Integration (Metadata Only)
- **Authentication tokens** - Secure JWT-based auth
- **Usage metadata** - Quota tracking and activity logs
- **Optional sync** - User-controlled data synchronization
- **Row Level Security** - Complete data isolation per user

### Data Isolation Strategy
```
Per-User Data Directory:
%AppData%/XalesIn/{user_id}/
├── session/              # WhatsApp session data
├── dexie-db/            # Local IndexedDB
└── assets/              # User assets and media
```

## 🎨 UI Components

### Built with shadcn/ui
- **Form Components**: Input, Textarea, Select, Checkbox, Radio Group
- **Layout Components**: Card, Dialog, Sheet, Popover, Tooltip
- **Navigation**: Tabs, Navigation Menu, Breadcrumb, Pagination
- **Data Display**: Table, Avatar, Badge, Calendar
- **Feedback**: Alert, Toast, Progress, Skeleton
- **Custom Components**: AnimatedButton, ContactModal, FilePreviewModal

### Animation & Interaction
- **Framer Motion integration** for smooth transitions
- **Micro-interactions** for user feedback
- **Loading states** with skeleton screens
- **Responsive animations** for all screen sizes

## 🚦 Development Guidelines

### Code Quality
- **TypeScript strict mode** - Full type safety
- **ESLint + Prettier** - Consistent code formatting
- **Component composition** - Reusable, modular components
- **Error boundaries** - Graceful error handling
- **Performance optimization** - React.memo, useMemo, useCallback

### Architecture Patterns
- **Service abstraction layer** - Easy migration from mock to real data
- **Custom hooks** - Reusable stateful logic
- **Context for global state** - User, theme, and app settings
- **Component composition** - Flexible, reusable UI blocks

## 🎯 Future Roadmap

### Phase 2: Backend Integration
- [ ] Supabase client integration
- [ ] Real authentication flow
- [ ] Data synchronization logic
- [ ] Quota management system
- [ ] Activity logging

### Phase 3: WhatsApp Runtime
- [ ] Puppeteer integration
- [ ] WhatsApp-web.js implementation
- [ ] State machine for automation
- [ ] Real message sending
- [ ] Progress tracking and error handling

### Post-MVP Policy
- After Phase 3 stabilization: **halt Electron development**
- Create separate **Admin Web UI** project for future features
- All Supabase changes via **MCP workflow** (no direct Studio edits)

## 🤝 Contributing

### Development Setup
1. Follow the installation instructions above
2. Create feature branches for new development
3. Ensure all TypeScript types are properly defined
4. Add tests for new functionality
5. Update documentation as needed

### Code Standards
- **TypeScript strict mode** compliance
- **Component naming**: PascalCase for components, camelCase for functions
- **File organization**: Group related functionality
- **Documentation**: Clear comments for complex logic
- **Testing**: Unit tests for utilities, component tests for UI

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For technical support or questions about the architecture:
- Review the `Architecture_WhatsappAutomation.md` document
- Check the `PHASE1_CHECKLIST.md` for current status
- Refer to `PHASE1_PROJECT_ANALYSIS.md` for detailed implementation notes

---

**Built with ❤️ using modern web technologies**
*Local-first • Privacy-focused • Performance-optimized*
