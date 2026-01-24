# Comprehensive SyncManager Refactoring Master Plan

## 1. Executive Summary
This document consolidates and validates the refactoring strategy for `SyncManager.ts`. The primary goal is to decompose the monolithic class into a modular, testable architecture that guarantees data integrity through centralized state management and rigorous race condition prevention.

**Status**: VALIDATED & FEASIBLE
**Target Architecture**: Modular Service-Based (Orchestrator Pattern)

---

## 2. Core Architecture & Modules

The `SyncManager` will evolve from a "God Class" into an **Orchestrator** that coordinates specialized modules.

### 2.1 Module Responsibility Matrix

| Module | Responsibility | Key Features |
|--------|----------------|--------------|
| **SyncManager (Orchestrator)** | High-level coordination, public API surface. | Delegates tasks, initializes sub-modules, handles lifecycle. |
| **StateManager** | SSOT (Single Source of Truth) for sync state. | Detailed state tracking, immutable updates, event checking. |
| **LockManager** | Resource concurrency control. | Global lock (DB), Table-level locks, Operation locks. |
| **SyncEngine** | Execution of core logic. | Pull/Push logic, payload processing, error handling. |
| **OperationQueue** | Task scheduling & throttling. | Priority handling, retries, batch processing. |
| **NetworkMonitor** | Connection health. | Online/offline detection, quality metrics. |

---

## 3. Detailed Technical Implementation

### 3.1 Centralized State Management (`StateManager`)
**Objective**: Eliminate "Distributed State" where simple booleans scattered across the class control complex logic.

*   **Implementation**:
    *   Use a functional state update pattern: `update(prev => ({ ...prev, ...check }))`.
    *   **State Interface**:
        ```typescript
        interface SyncState {
          status: 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';
          activeOperations: Set<string>; // IDs of currently running tasks
          tableLocks: Map<string, string>; // TableName -> LockOwnerID
          progress: Map<string, number>; // TableName -> % completed
          lastSync: Map<string, number>; // TableName -> Timestamp
          isOnline: boolean;
        }
        ```
    *   **Validation**: Every state update runs through a validator (e.g., cannot transition from `OFFLINE` to `SYNCING` without `IDLE` or `RECONNECTING` first).

### 3.2 Race Condition Prevention (`LockManager`)
**Objective**: Prevent multiple processes from writing to the same table or using the global DB connection simultaneously.

*   **Locking Hierarchy (Critical for Deadlock Prevention)**:
    1.  **Global Lock** (Migration / Critical Reset)
    2.  **Table Lock** (Syncing a specific table)
    3.  **Operation Lock** (Specific Item/Task)
    *   *Rule*: A process acquiring a Global Lock must wait for all Table locks to release. A Table lock cannot be acquired if a Global Lock is held.

*   **Technology**: `async-mutex` or a custom Promise-based queue implementation.

### 3.3 Transactional Integrity (`SyncEngine`)
**Objective**: Ensure atomic operations. If a sync fails batch execution, no partial data should intentionally remain unless marked as "retry pending".

*   **Strategy**:
    *   Use `db.transaction('rw', tables, async () => { ... })` for all batch writes.
    *   **State Rollback**: If a DB transaction fails, the `StateManager` must revert the "Syncing" flag immediately.

### 3.4 Event Sequencing (`OperationQueue`)
**Objective**: Ensure initial sync finishes before auto-sync starts, and heavy jobs don't block critical UI updates.

*   **Strategy**:
    *   **Priority Queue**: High (User Action) > Medium (Initial Sync) > Low (Background Poll).
    *   **Serial Execution for Dependencies**: If Task B depends on Task A (e.g., Sync Contacts before Messages), B must sit in a "Waiting" queue.

---

## 4. Implementation Phase Plan

To ensure feasibility and minimize breakage, we will use a **Strangler Fig Pattern**: new modules are built alongside the old one, and logic is migrated piece by piece.

### Phase 1: Foundation (The "Brain")
1.  **Create `StateManager`**: Implement the class with `RxJS` BehaviorSubject or simple Listeners.
2.  **Create `LockManager`**: Implement Mutex logic.
3.  **Integrate into Legacy `SyncManager`**: Replace `this.isSyncing` and `this._tableSyncInProgress` with `this.stateManager.getState()`.
    *   *Validation*: App runs exactly as before, but state is now observable.

### Phase 2: concurrency Control (The "Guard")
1.  **Wrap DB Operations**: Create `SyncEngine` methods that accept a `Lock` token.
2.  **Refactor `pullTableFromServer`**: Move logic to `SyncEngine`, protected by `LockManager.acquireTableLock()`.
    *   *Validation*: Try triggering manual sync while auto-sync is running. One should wait or abort gracefully.

### Phase 3: Queue & Execution (The "Worker")
1.  **Implement `OperationQueue`**: Move `p-queue` or custom queue logic here.
2.  **Migrate `processBatch`**: Move deeply nested specific sync logic out of the main file.

### Phase 4: Cleanup & Polish
1.  **Remove Legacy Flags**: Delete old boolean flags.
2.  **Add `RecoveryManager`**: Logic to detect "Stuck Locks" (e.g., if app crashes while syncing) and release them on startup.

---

## 5. Feasibility & Risk Assessment

### 5.1 Validity Checks
*   **Is Dexie transaction compatible?** Yes, Dexie transactions are robust.
*   **Is StateManager overhead too high?** No, state objects are small. Functional updates are efficient (sub-ms).
*   **Locking Overhead**: `async-mutex` adds negligible overhead compared to network IO.

### 5.2 Identified Risks
*   **Deadlocks**: If we are not strict about the "Hierarchy of Locks", we could freeze the sync.
    *   *Mitigation*: Add a timeout to every lock acquisition (e.g., 30s). If timeout, throw "Resource Busy" and retry later.
*   **Migration regressions**: The existing logic is complex (2000+ lines). Missing a specific edge case condition (e.g., "skip sync if user is editing") is easy.
    *   *Mitigation*: Unit tests for the new `SyncEngine` must cover these edge cases before swapping.

---

## 6. Next Steps (Actionable)

1.  **Verify Tests**: Ensure current `SyncManager` has at least basic smoke tests.
2.  **Scaffold**: Create the `core/sync/` directory structure.
3.  **Start Phase 1**: Build `StateManager.ts` and wiring it up.
