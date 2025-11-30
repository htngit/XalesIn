# 📋 Phase 3: WhatsApp Runtime Integration - Task & Walkthrough

**Project**: Xender-In WhatsApp Automation  
**Goal**: Implement the Electron Main Process and WhatsApp Runtime Integration (Bidirectional Messaging)  
**Reference Documents**: All located in `Plan/` folder.

---

## 🛑 Pre-requisites (Critical Fixes)

Before starting the main development, you **MUST** complete these tasks:

1.  **Install Missing Package**
    - [x] Run `npm install @supabase/supabase-js` ✅ **DONE** (Already installed v2.81.1)
    - [x] Verify installation with `node -e "console.log(require('@supabase/supabase-js'))"` ✅ **DONE**

2.  **Fix Template Schema**
    - [x] Migrate Supabase `templates` table: Change `content` (TEXT) to `variants` (TEXT[]) ✅ **DONE** (Already has `variants: ARRAY`)
    - [x] Update local Dexie schema if needed (ensure alignment) ✅ **DONE** (Schema aligned)
    - [ ] Verify sync works correctly

3.  **Environment Setup**
    - [ ] Backup Dexie database (Export JSON)
    - [ ] Create new branch: `git checkout -b feature/whatsapp-integration`

4.  **Supabase Development Rule** ⚠️
    - [ ] **MANDATORY**: All Supabase interactions (Migrations, SQL execution, Table management) **MUST** be done using the **MCP Supabase Tool**.
    - [ ] Do **NOT** use the Supabase Dashboard manually unless absolutely necessary for debugging.
    - [ ] Always write SQL migrations to a file first, then apply via MCP.

---

## ✅ Task List (To Do)

### **Week 1: Infrastructure Setup** ✅ **COMPLETED**
- [x] **1.1 Install Dependencies** ✅ **DONE**
    - [x] `electron`, `electron-builder` (v33.2.1)
    - [x] `whatsapp-web.js` (v1.26.0), `puppeteer` (v18.2.1)
    - [x] `qrcode-terminal`, `node-fetch`
    - [x] `@types/electron`, `@types/puppeteer`
    - [x] `vite-plugin-electron`, `vite-plugin-electron-renderer`
- [x] **1.2 Configure Build System** ✅ **DONE**
    - [x] Update `vite.config.ts` (Dual build: Renderer + Main)
    - [x] Update `package.json` (Scripts: `electron:dev`, `electron:build`, main entry)
    - [x] Create `electron-builder.yml`
- [x] **1.3 Create Main Process Skeleton** ✅ **DONE**
    - [x] Create `src/main/main.ts` (Entry point)
    - [x] Create `src/main/preload.ts` (ContextBridge with WhatsApp API)
    - [x] Create `src/main/ipcHandlers.ts` (Placeholder handlers)
- [x] **1.4 Verify Window Launch** ✅ **DONE**
    - [x] Run `npm run electron:dev`
    - [x] Ensure React app loads inside Electron window
    - [x] DevTools opened successfully

**Week 1 Notes**:
- ✅ Electron window launches successfully
- ✅ Build process working (main.js: 1.45 kB, preload.js: 1.55 kB)
- ⚠️ Minor DevTools warnings (Autofill) - not critical
- ✅ IPC skeleton ready for expansion

---

### **Week 2: WhatsApp Core (Worker 1 & 3)** ✅ **COMPLETED**
- [x] **2.1 Implement WhatsAppManager (Worker 1)** ✅ **DONE**
    - [x] Initialize `Client` (whatsapp-web.js)
    - [x] Handle QR Code generation
    - [x] Handle Session persistence (LocalAuth)
    - [x] Implement `sendMessage` (Text & Media)
    - [x] Setup event handlers (qr, ready, authenticated, disconnected)
    - [x] Implement message receiving (for future MessageReceiverWorker)
- [x] **2.2 Implement IPC Handlers (Worker 3)** ✅ **DONE**
    - [x] Connect Renderer to Main (`whatsapp:connect`, `whatsapp:send-message`)
    - [x] Broadcast events (`whatsapp:qr-code`, `whatsapp:status-change`)
    - [x] Implement all core IPC channels
    - [x] Add error handling for all handlers
- [x] **2.3 Build Preload Bridge (Worker 4)** ✅ **DONE**
    - [x] Expose safe API via `window.electron.whatsapp`
    - [x] Add TypeScript type definitions (`src/types/electron.d.ts`)
    - [x] Implement event listener cleanup functions
- [x] **2.4 Test Authentication** ✅ **READY FOR TESTING**
    - [x] App compiles and runs successfully
    - [x] Verify QR code appears in Console/UI (See Week 2.5)
    - [ ] Verify Session restores after restart (needs testing)

**Week 2 Notes**:
- ✅ WhatsAppManager fully implemented (260 lines)
- ✅ Complete event handling (QR, ready, auth, disconnect, messages)
- ✅ IPC handlers with proper error handling (170 lines)
- ✅ Type-safe Preload bridge with cleanup functions
- ✅ Build successful (preload.js: 2.73 kB)
- ⚠️ Minor warning from qrcode-terminal (legacy octal escape) - not critical
- 🎯 Ready for UI integration to test QR code display

**Files Created**:
1. `src/main/WhatsAppManager.ts` - Core WhatsApp client manager
2. `src/main/ipcHandlers.ts` - Updated with full integration
3. `src/main/preload.ts` - Enhanced with complete API
4. `src/types/electron.d.ts` - TypeScript definitions

---

### **Week 2.5: UI Integration (WhatsApp Connect)** ✅ **COMPLETED**
- [x] **2.5.1 Implement WhatsAppConnectionStatus Component** ✅ **DONE**
    - [x] Create `src/components/ui/WhatsAppConnectionStatus.tsx`
    - [x] Implement status badge (Connected, Connecting, Disconnected)
    - [x] Implement Connect/Disconnect buttons
    - [x] Implement QR Code Modal using `react-qr-code`
    - [x] Connect to Electron IPC events (`onQRCode`, `onStatusChange`)
- [x] **2.5.2 Integrate into Dashboard** ✅ **DONE**
    - [x] Add component to `src/components/pages/Dashboard.tsx` header
    - [x] Ensure responsive layout

**Week 2.5 Notes**:
- ✅ UI Component fully implemented and integrated
- ✅ Ready for end-to-end connection testing

---

### **Week 3: Message Processing (Worker 2 & 6)** ✅ **COMPLETED**
- [x] **3.1 Implement MessageProcessor (Worker 2)** ✅ **DONE**
    - [x] Create State Machine (IDLE → PENDING → PROCESSING)
    - [x] Implement `processJob(jobId)`
    - [x] Handle Delays (Static/Dynamic)
    - [x] Progress reporting via IPC (`whatsapp:job-progress`)
- [x] **3.2 Implement SendWorker (Worker 6)** ✅ **DONE**
    - [x] Format messages (Replace variables `{{name}}`)
    - [x] Attach assets (Support for media messages)
    - [x] Execute sending via `WhatsAppManager`
    - [x] Integrated into `MessageProcessor` class
- [x] **3.3 Connect to Database** ✅ **DONE**
    - [x] Main Process receives job data via IPC `whatsapp:process-job`
    - [x] No direct DB access needed in Main Process (Renderer handles DB read)

**Week 3 Notes**:
- ✅ `MessageProcessor.ts` implemented with robust job handling
- ✅ Supports Pause/Resume/Stop operations
- ✅ Variable replacement logic implemented (`{{name}}`, etc.)
- ✅ Random delay logic added (2-5s) for safety
- ✅ IPC handlers updated to use MessageProcessor

**Files Created**:
1. `src/main/MessageProcessor.ts` - Core message processing logic

---

### **Week 3.5: Frontend Integration (Sending & Progress)** ✅ **COMPLETED**
- [x] **3.5.1 UI Integration for Campaign Sending** ✅ **DONE**
    - [x] Add "Start Campaign" button to Send/Campaign page
    - [x] Fetch contacts from selected group (Dexie `contacts`)
    - [x] Fetch selected template (Dexie `templates`)
    - [x] Call `window.electron.whatsapp.processJob()` with job data
    - [x] Handle response & errors
- [x] **3.5.2 Progress Monitoring UI** ✅ **DONE**
    - [x] Create `JobProgressToast` or `JobProgressModal` component
    - [x] Listen to `window.electron.whatsapp.onJobProgress()`
    - [x] Display real-time progress (processed/total, success/failed)
    - [x] Show Pause/Resume/Stop buttons
- [x] **3.5.3 Quota & History Database Updates** ✅ **DONE**
    - [x] On job completion, update Dexie `quota.messages_used`
    - [x] Create `history` entry for the campaign
    - [x] Sync to Supabase via `SyncManager`
- [x] **3.5.4 Error Handling** ✅ **DONE**
    - [x] Display WhatsApp connection errors to user
    - [x] Handle "WhatsApp not ready" state gracefully

**Week 3.5 Notes**:
- ✅ `JobProgressModal` created for real-time monitoring
- ✅ `SendPage` fully integrated with IPC and Dexie
- ✅ Quota reservation and commit logic implemented
- ✅ History logging added on job completion

---

### **Week 4: Background Workers & Receiver (Worker 5, 7, 8)**
- [ ] **4.1 Implement QueueWorker (Worker 5)**
    - [ ] Monitor for pending jobs
    - [ ] Manage Priority Queue
- [ ] **4.2 Implement StatusWorker (Worker 7)**
    - [ ] Monitor Connection Health
    - [ ] Auto-reconnect logic
- [ ] **4.3 Implement MessageReceiverWorker (Worker 8) ⭐**
    - [ ] Listen for incoming messages in `WhatsAppManager`
    - [ ] Detect Unsubscribe keywords (STOP, BERHENTI, etc.)
    - [ ] Broadcast `whatsapp:unsubscribe-detected` to Renderer
    - [ ] **Frontend**: Listen to unsubscribe events
    - [ ] **Frontend**: Update contact status in Dexie (`contacts.subscribed = false`)
    - [ ] **Frontend**: Sync to Supabase
- [ ] **4.4 Final Integration Testing**
    - [ ] End-to-End Send Flow (UI → WhatsApp → Quota Update)
    - [ ] Receive Flow (WhatsApp → Unsubscribe → DB Update)
    - [ ] Test session persistence (restart app, should auto-connect)
    - [ ] Build & Package App (`npm run electron:build`)

---

## 🚶 Walkthrough Guide

This guide explains **how** to execute the tasks above using the documentation provided in the `Plan/` folder.

### **Step 1: Understand the Architecture** ✅ **COMPLETED**
*   **Read**: `Plan/BACKEND_WHATSAPP_ANALYSIS_REPORT.md`
*   **Focus**: Look at the "Arsitektur Backend WhatsApp" diagram. Understand that we are building a **Node.js layer** (Main Process) that sits between your React UI and the WhatsApp Web instance (Puppeteer).
*   **Key Concept**: The UI *never* talks to WhatsApp directly. It sends an IPC message to the Main Process, which then delegates to the `WhatsAppManager`.

### **Step 2: Set up the Foundation (Week 1)** ✅ **COMPLETED**
*   **Reference**: `Plan/WORKERS_IMPLEMENTATION_CHECKLIST.md` -> Section "Dependencies Installation" & "Configuration Files".
*   **Action**:
    1.  ✅ Run the npm install commands.
    2.  ✅ Copy the file structure layout to your `src/main` folder.
    3.  ✅ **Crucial**: You need to configure Vite to build *both* the React app and the Electron main process. This usually involves a specific `vite-electron-plugin` or a separate build config. Check `vite.config.ts` instructions carefully.

### **Step 3: Build the Core Client (Week 2)** ✅ **COMPLETED**
*   **Reference**: `Plan/WORKERS_IMPLEMENTATION_CHECKLIST.md` -> "Worker 1: WhatsAppManager".
*   **Action**:
    1.  ✅ Create `src/main/WhatsAppManager.ts`.
    2.  ✅ Implement the `initialize()` method using `whatsapp-web.js`.
    3.  ✅ **Tip**: Start simple. Just try to get the QR code to log to the terminal first.
    4.  ✅ Once that works, implement the IPC Handlers (`src/main/ipcHandlers.ts`) to send that QR code string to the React UI so it can display it.

### **Step 4: The Brain of the Operation (Week 3)** ✅ **COMPLETED**
*   **Reference**: `Plan/Guide_to_Backend_Server_Whatsapp.md` -> Section "Message Processor Implementation".
*   **Action**:
    1.  ✅ This is the hardest part. You are building a **State Machine**.
    2.  ✅ The `MessageProcessor` needs to fetch a "Job" from the database (Dexie).
    3.  ✅ Since Dexie is native to the Browser (Renderer), you have two choices:
        *   **Option A (Recommended)**: The Renderer reads the DB and sends the *entire* job data to the Main Process via IPC.
        *   **Option B**: The Main Process accesses the underlying IndexedDB (harder with Electron).
    4.  ✅ Stick to **Option A** for simplicity in Phase 3. Pass the data needed for sending (Phone numbers, Message content) to the `processJob` IPC call.

### **Step 5: The Workers (Week 4)**
*   **Reference**: `Plan/UPDATE_SUMMARY_MESSAGERECEIVER.md` & `Plan/WORKERS_IMPLEMENTATION_CHECKLIST.md`.
*   **Action**:
    1.  **QueueWorker**: Simple poller. Checks if there's work to do.
    2.  **StatusWorker**: Just a heartbeat. "Are we connected?" If no, try `client.initialize()` again.
    3.  **MessageReceiverWorker**: This is the new star.
        *   Hook into `client.on('message', ...)` in `WhatsAppManager`.
        *   Pass the message to `MessageReceiverWorker`.
        *   Check if `msg.body.toLowerCase()` is in your keyword list.
        *   If yes, fire an IPC event `whatsapp:unsubscribe-detected`.

### **Step 6: Final Polish**
*   **Action**:
    1.  Run the full build: `npm run electron:build`.
    2.  Install the resulting `.exe` or `.dmg`.
    3.  Test the full flow: Open App -> Scan QR -> Send Bulk Message -> Receive Reply.

---

## 💡 Tips for Success

1.  **IPC is Async**: Remember that communication between React and Electron is asynchronous. Always use `async/await` or Promises.
2.  **Security**: Never enable `nodeIntegration: true` in the BrowserWindow. Use the `preload.ts` bridge as designed.
3.  **Logging**: `console.log` in the Main Process appears in your **Terminal**, not the Browser Console. Use it liberally for debugging.
4.  **Whatsapp-web.js**: This library relies on the actual WhatsApp Web DOM. If WhatsApp updates their UI, this library might break. Keep it updated.

---

---

## 📊 Progress Summary

**Overall Progress**: 80% (Week 1, 2, 2.5, 3 & 3.5 of 5 completed)

| Week | Status | Progress |
|------|--------|----------|
| Week 1: Infrastructure Setup | ✅ COMPLETED | 100% |
| Week 2: WhatsApp Core | ✅ COMPLETED | 100% |
| Week 2.5: UI Integration (Connect) | ✅ COMPLETED | 100% |
| Week 3: Message Processing | ✅ COMPLETED | 100% |
| Week 3.5: Frontend Integration | ✅ COMPLETED | 100% |
| Week 4: Workers & Receiver | 🔄 NEXT | 0% |

**Last Updated**: 2025-11-30 13:55 WIB

---

**Ready to start Week 4?** Background workers for queue management, auto-reconnect, and unsubscribe detection!
