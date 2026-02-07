# XalesIn Project Architecture Analysis

> **Context**: This document provides a high-level architectural overview of the current "XalesIn" codebase to facilitate discussion regarding the implementation of a **Team CRM** system.

## 1. Technology Stack

*   **Runtime**: Electron (Desktop Application)
*   **Frontend**: React, Vite, TailwindCSS, shadcn/ui
*   **Backend (Local)**: Node.js (Electron Main Process)
*   **Database (Local)**: Dexie.js (IndexedDB wrapper)
*   **Database (Cloud)**: Supabase (PostgreSQL)
*   **Core Engine**: `whatsapp-web.js` (running via Puppeteer)
*   **Languages**: TypeScript (Strict Mode)

## 2. System Architecture

The application follows a **Local-First, Cloud-Sync** architecture.

### A. Data Layer
*   **Local-First Philosophy**: All reads/writes happen primarily to the local IndexedDB (Dexie). This ensures the app works offline and provides instant UI feedback.
*   **Synchronization**: A dedicated `SyncManager` handles bi-directional syncing with Supabase.
    *   **Strategy**: "Last Write Wins" (configurable).
    *   **Metadata**: Every table includes `_syncStatus`, `_version`, and `_lastModified`.
    *   **Isolation**: All data is scoped by `master_user_id`. This effectively isolates data per "Workspace" or "Account Owner".

### B. Access Control (Current)
*   **Master User Model**: The system is designed around a single "Master User" (the account owner).
*   **Team Concepts**:
    *   Foundational tables `teams` and `profiles` exist in the schema.
    *   `profiles` has a `role` field ('owner' | 'staff'), but strict Role-Based Access Control (RBAC) logic is not yet fully implemented in the service layer.

### C. WhatsApp Engine (`WhatsAppManager.ts`)
*   **Single-Session Design**: Currently, the engine manages a single `Client` instance tailored for the desktop user.
*   **Process**: integrated directly into the Electron Main process.
*   **Puppeteer Integration**: Uses a custom `PuppeteerBrowserManager` to fetch and manage Chrome binaries dynamically.

## 3. High-Level Architecture Diagram (Current)

```mermaid
graph TD
    User[User / Application] <-->|IPC| MainProc[Electron Main Process]
    
    subgraph "Main Process"
        WA[WhatsApp Manager] -->|Puppeteer| WABrowser[Headless Chrome]
        Worker[MessageWorker] -->|IPC| Renderer
    end
    
    subgraph "Renderer Process"
        UI[React UI] <-->|Direct| Dexie[IndexedDB (Local)]
    end
    
    Dexie <-->|SyncManager| Supabase[Supabase Cloud DB]
```

## 4. Gap Analysis for Team CRM

To implement a full-featured Team CRM where multiple agents can manage chats, the following architectural shifts are required:

### A. Session Management
*   **Current**: Single WA Session per Desktop App instance.
*   **Required**: If the "Team" needs to share *one* WhatsApp number:
    *   The "Owner" instances maintains the WA Session.
    *   "Staff" instances must sync messages via Supabase real-time, effectively treating Supabase as the message broker.
    *   **Challenge**: Outbound messages from Staff must be routed via Supabase -> Owner's App -> WhatsApp.

### B. Authentication & RBAC
*   **Current**: Simple "Master User" check.
*   **Required**:
    *   **Granular Permissions**: "Can Reply", "Can Burst/Blast", "View Only", "No Contact Export".
    *   **Staff Login**: Mechanism for Staff to log in to the "Owner's" workspace without having the WhatsApp credentials themselves.

### C. State Management
*   **Current**: Local state is king.
*   **Required**: "Presence" validation. If Agent A is typing, Agent B should see it. This requires leveraging Supabase Realtime channels.

## 5. Proposed "Team CRM" Data Flow

1.  **Inbound Message**:
    *   Owner App (WA Engine) receives message.
    *   Saves to Local DB -> Syncs to Supabase.
    *   Supabase triggers Realtime Event.
    *   Staff App receives Event -> Updates UI.

2.  **Outbound Message (Staff)**:
    *   Staff writes message -> Saves to 'queue' in Supabase (status: 'pending_send').
    *   Owner App listens to 'queue' -> Picks up message -> Sends via WA Engine.
    *   Owner App updates status to 'sent' -> Syncs back.

## 6. Supabase Cloud Schema (Reference)

> **Note to AI Agent**: The following tables exist in the Supabase Cloud database. Please analyze their detailed structure (columns, constraints, RLS policies) to ensure they support the proposed Team CRM architecture.

*   `profiles`: User profiles (Owner/Staff roles).
*   `teams`: Team grouping entities.
*   `contacts`: Synced contacts.
*   `groups`: Contact groups.
*   `messages`: Chat history (Inbox).
*   `history`: Activity logs (Broadcast history).
*   `assets`: Media assets.
*   `templates`: Message templates.
*   `user_quotas`: Quota management.
*   `quota_reservations`: Temporary quota locks.
*   `payments`: Payment records.
*   `user_sessions`: Session management.
*   `app_versions`: Application version control.
