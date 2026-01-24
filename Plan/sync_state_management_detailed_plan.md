# Detailed Race Condition Prevention and State Management Strategies for SyncManager Refactoring

## 1. Current Race Condition Analysis

### 1.1 Identified Race Conditions in Existing Code

#### 1.1.1 Concurrent Table Sync Operations
**Problem**: Multiple tables can be synced simultaneously, leading to potential conflicts when accessing shared resources like the sync queue or database connections.

**Current Code Evidence**:
```typescript
// In pullTableFromServer method:
if (!options?.force && this._tableSyncInProgress.get(tableName)) {
  console.log(`SyncManager: Sync already in progress for ${tableName}, skipping`);
  return;
}
this._tableSyncInProgress.set(tableName, true);
```

**Risk**: While there's basic protection for individual tables, multiple tables can still sync simultaneously, potentially overwhelming database connections or causing resource contention.

#### 1.1.2 Initial Sync vs Auto-Sync Interference
**Problem**: Initial sync and auto-sync can run concurrently, causing duplicate operations and resource contention.

**Current Code Evidence**:
```typescript
public setInitialSyncInProgress(value: boolean): void {
  this._isInitialSyncInProgress = value;
  if (!value) {
    // Initial sync done, restart autoSync if configured
    this.startAutoSync();
  }
}
```

**Risk**: The auto-sync starts immediately after initial sync completes, potentially interfering with other operations.

#### 1.1.3 Queue Processing Race Conditions
**Problem**: Multiple operations can be processed simultaneously without proper coordination, leading to inconsistent states.

**Current Code Evidence**:
```typescript
private async processBatchWithRetry(operations: PrioritySyncOperation[]): Promise<void> {
  const results = await Promise.allSettled(
    operations.map(operation => this.processOperationWithRetry(operation))
  );
}
```

**Risk**: Operations are processed in parallel without coordination, potentially causing conflicts.

#### 1.1.4 Cache Access Without Synchronization
**Problem**: Multiple operations access shared caches without proper synchronization.

**Current Code Evidence**:
```typescript
private syncCache: Map<string, any> = new Map();
private compressionCache: Map<string, string> = new Map();
```

**Risk**: Concurrent access to these caches without synchronization could lead to inconsistent states.

#### 1.1.5 Database Transaction Issues
**Problem**: Multi-step database operations lack atomicity, leading to inconsistent states if operations fail partway through.

**Current Code Evidence**: Various database operations scattered throughout the code without explicit transaction management.

**Risk**: Partial updates can leave the database in an inconsistent state.

### 1.2 State Management Issues

#### 1.2.1 Distributed State Without Coordination
**Problem**: State is spread across multiple properties without centralized management.

**Current Code Evidence**:
```typescript
private status: SyncStatus = SyncStatus.IDLE;
private _isInitialSyncInProgress: boolean = false;
private _tableSyncInProgress: Map<string, boolean> = new Map();
private connectionState: ConnectionState;
private syncMetrics: SyncMetrics;
```

**Risk**: Updates to related state properties may not be coordinated, leading to inconsistent states.

#### 1.2.2 Inconsistent State Transitions
**Problem**: State transitions happen in multiple places without validation.

**Current Code Evidence**:
```typescript
private setStatus(status: SyncStatus, message?: string) {
  if (this.status !== status) {
    this.status = status;
    // ... emit event
  }
}
```

**Risk**: Invalid state transitions are possible, and related state properties may not be updated consistently.

## 2. Comprehensive Race Condition Prevention Strategies

### 2.1 Resource-Level Locking Implementation

#### 2.1.1 Table-Level Locking
```typescript
// New ResourceLockManager class
class ResourceLockManager {
  private tableLocks: Map<string, Mutex> = new Map();
  private globalLock: Mutex = new Mutex();
  
  async acquireTableLock(tableName: string): Promise<() => void> {
    if (!this.tableLocks.has(tableName)) {
      this.tableLocks.set(tableName, new Mutex());
    }
    
    const mutex = this.tableLocks.get(tableName)!;
    const release = await mutex.acquire();
    
    return release;
  }
  
  async acquireGlobalLock(): Promise<() => void> {
    return await this.globalLock.acquire();
  }
}
```

#### 2.1.2 Operation-Level Locking
```typescript
// For protecting individual operations
class OperationLockManager {
  private operationLocks: Map<string, Mutex> = new Map();
  
  async acquireOperationLock(operationId: string): Promise<() => void> {
    const lockKey = `op_${operationId}`;
    if (!this.operationLocks.has(lockKey)) {
      this.operationLocks.set(lockKey, new Mutex());
    }
    
    const mutex = this.operationLocks.get(lockKey)!;
    const release = await mutex.acquire();
    
    return () => {
      release();
      // Clean up if no one else is waiting
      if (!mutex.isLocked()) {
        this.operationLocks.delete(lockKey);
      }
    };
  }
}
```

### 2.2 Critical Section Protection

#### 2.2.1 Database Access Protection
```typescript
// In SyncEngine class
async protected withDatabaseLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await this.resourceLocks.acquireGlobalLock();
  try {
    return await fn();
  } finally {
    release();
  }
}

async processOperation(operation: SyncOperation): Promise<void> {
  const operationLock = await this.operationLocks.acquireOperationLock(operation.id!);
  try {
    await this.withDatabaseLock(async () => {
      // Process operation with exclusive database access
      await this.executeOperation(operation);
    });
  } finally {
    operationLock();
  }
}
```

#### 2.2.2 Cache Access Protection
```typescript
// In StateManager class
async updateSyncCache<T>(key: string, value: T, ttl?: number): Promise<void> {
  const release = await this.cacheLock.acquire();
  try {
    this.state.syncCache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : null
    });
    this.cleanExpiredCache();
  } finally {
    release();
  }
}

private cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, item] of this.state.syncCache.entries()) {
    if (item.ttl && item.ttl < now) {
      this.state.syncCache.delete(key);
    }
  }
}
```

### 2.3 Transaction Support for Multi-Step Operations

#### 2.3.1 Database Transaction Wrapper
```typescript
// In SyncEngine class
async executeInTransaction<T>(operations: Array<() => Promise<void>>): Promise<T> {
  // Begin transaction
  const tx = db.transaction('rw', Object.values(db.tables));
  
  try {
    for (const operation of operations) {
      await operation();
    }
    
    // Commit transaction
    await tx.commit();
    return {} as T; // Return appropriate result
  } catch (error) {
    // Rollback transaction
    await tx.abort();
    throw error;
  }
}
```

#### 2.3.2 State Transaction Support
```typescript
// In StateManager class
async executeStateTransaction(
  updates: Array<(state: SyncState) => SyncState>,
  rollbackUpdates?: Array<(state: SyncState) => SyncState>
): Promise<void> {
  const release = await this.stateLock.acquire();
  try {
    const originalState = { ...this.state };
    
    for (const update of updates) {
      this.state = update({ ...this.state });
    }
    
    // Validate final state
    this.validateState(this.state);
  } catch (error) {
    // Attempt rollback if rollback updates provided
    if (rollbackUpdates) {
      for (const rollbackUpdate of [...rollbackUpdates].reverse()) {
        this.state = rollbackUpdate({ ...this.state });
      }
    }
    throw error;
  } finally {
    release();
  }
}
```

### 2.4 Event Ordering and Sequencing

#### 2.4.1 Sequential Event Processor
```typescript
// In SyncManager class
private eventQueue: Array<() => Promise<void>> = [];
private isProcessingEvents: boolean = false;

async enqueueEvent(event: Omit<SyncEvent, 'timestamp'>): Promise<void> {
  return new Promise((resolve, reject) => {
    this.eventQueue.push(async () => {
      try {
        await this.processEvent(event);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    // Start processing if not already processing
    if (!this.isProcessingEvents) {
      this.processEventQueue();
    }
  });
}

private async processEventQueue(): Promise<void> {
  this.isProcessingEvents = true;
  
  while (this.eventQueue.length > 0) {
    const eventProcessor = this.eventQueue.shift()!;
    try {
      await eventProcessor();
    } catch (error) {
      console.error('Error processing event:', error);
    }
  }
  
  this.isProcessingEvents = false;
}
```

#### 2.4.2 Dependency-Aware Event Processing
```typescript
// For events that depend on other events completing first
interface DependentEvent {
  event: Omit<SyncEvent, 'timestamp'>;
  dependencies: string[]; // Event IDs this event depends on
  eventId: string;
}

class EventSequencer {
  private pendingEvents: Map<string, DependentEvent> = new Map();
  private completedEvents: Set<string> = new Set();
  private processingQueue: DependentEvent[] = [];
  
  async addEvent(event: DependentEvent): Promise<void> {
    if (this.areDependenciesMet(event)) {
      this.processingQueue.push(event);
      this.processNextEvent();
    } else {
      this.pendingEvents.set(event.eventId, event);
    }
  }
  
  private areDependenciesMet(event: DependentEvent): boolean {
    return event.dependencies.every(depId => this.completedEvents.has(depId));
  }
  
  private processNextEvent(): void {
    const event = this.processingQueue.shift();
    if (event) {
      // Process the event
      this.executeEvent(event.event);
      this.completedEvents.add(event.eventId);
      
      // Check if any pending events can now be processed
      for (const [id, pendingEvent] of this.pendingEvents.entries()) {
        if (this.areDependenciesMet(pendingEvent)) {
          this.processingQueue.push(pendingEvent);
          this.pendingEvents.delete(id);
        }
      }
    }
  }
}
```

## 3. State Management Implementation

### 3.1 Centralized State Management

#### 3.1.1 State Definition
```typescript
// In core/types.ts
export interface SyncState {
  // Basic status
  status: SyncStatus;
  isOnline: boolean;
  
  // Sync progress tracking
  initialSyncInProgress: boolean;
  tableSyncProgress: Map<string, TableSyncStatus>;
  activeOperations: Set<string>;
  
  // Connection and quality
  connectionState: ConnectionState;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  
  // Metrics and performance
  syncMetrics: SyncMetrics;
  performanceHistory: Array<{ timestamp: Date; duration: number; operations: number }>;
  
  // Timing and scheduling
  lastSyncTimes: Map<string, string>; // table -> timestamp
  currentSyncInterval: number;
  scheduledSyncs: Map<string, NodeJS.Timeout>; // syncId -> timeout
  
  // Retry and error handling
  retryDelays: Map<string, number>; // operationId -> delay
  consecutiveFailures: number;
  
  // Caching
  syncCache: Map<string, { value: any; timestamp: number; ttl: number | null }>;
  compressionCache: Map<string, { value: string; timestamp: number }>;
  
  // Activity tracking
  lastUserActivity: Date;
  isActive: boolean;
}

interface TableSyncStatus {
  inProgress: boolean;
  startTime: Date | null;
  progress: number;
  totalRecords: number;
  processedRecords: number;
}
```

#### 3.1.2 State Manager Implementation
```typescript
// In core/StateManager.ts
import { Mutex } from 'async-mutex';

export class StateManager {
  private state: SyncState;
  private stateLock: Mutex;
  private listeners: Array<(prevState: SyncState, newState: SyncState) => void> = [];
  private validators: Array<(state: SyncState) => void> = [];
  
  constructor(initialState?: Partial<SyncState>) {
    this.stateLock = new Mutex();
    this.state = this.createInitialState(initialState);
    
    // Add default validators
    this.validators.push(this.validateStatusTransitions.bind(this));
    this.validators.push(this.validateConnectionState.bind(this));
    this.validators.push(this.validateSyncProgress.bind(this));
  }
  
  private createInitialState(overrides?: Partial<SyncState>): SyncState {
    return {
      status: SyncStatus.IDLE,
      isOnline: navigator.onLine,
      initialSyncInProgress: false,
      tableSyncProgress: new Map(),
      activeOperations: new Set(),
      connectionState: {
        isOnline: navigator.onLine,
        quality: 'good',
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageLatency: 0
      },
      connectionQuality: 'good',
      syncMetrics: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageSyncTime: 0,
        lastSyncTime: new Date(0),
        dataTransferred: 0,
        compressionRatio: 1.0,
        connectionQuality: 'good'
      },
      performanceHistory: [],
      lastSyncTimes: new Map(),
      currentSyncInterval: 3600000, // 1 hour default
      scheduledSyncs: new Map(),
      retryDelays: new Map(),
      consecutiveFailures: 0,
      syncCache: new Map(),
      compressionCache: new Map(),
      lastUserActivity: new Date(),
      isActive: true,
      ...overrides
    };
  }
  
  async updateState(updater: (state: SyncState) => SyncState): Promise<void> {
    const release = await this.stateLock.acquire();
    try {
      const prevState = this.cloneState(this.state);
      const newState = updater({ ...this.state });
      
      // Validate the new state
      this.validateState(newState);
      
      // Update the state
      this.state = newState;
      
      // Notify listeners
      this.notifyListeners(prevState, this.state);
    } finally {
      release();
    }
  }
  
  getState(): SyncState {
    return this.cloneState(this.state);
  }
  
  async withState<T>(fn: (state: SyncState) => Promise<T>): Promise<T> {
    const release = await this.stateLock.acquire();
    try {
      return await fn(this.getState());
    } finally {
      release();
    }
  }
  
  subscribe(listener: (prevState: SyncState, newState: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  private cloneState(state: SyncState): SyncState {
    return {
      ...state,
      tableSyncProgress: new Map(state.tableSyncProgress),
      activeOperations: new Set(state.activeOperations),
      lastSyncTimes: new Map(state.lastSyncTimes),
      scheduledSyncs: new Map(state.scheduledSyncs),
      retryDelays: new Map(state.retryDelays),
      syncCache: new Map(state.syncCache),
      compressionCache: new Map(state.compressionCache),
      performanceHistory: [...state.performanceHistory]
    };
  }
  
  private validateState(state: SyncState): void {
    for (const validator of this.validators) {
      validator(state);
    }
  }
  
  private validateStatusTransitions(state: SyncState): void {
    // Define valid state transitions
    const validTransitions: Record<SyncStatus, SyncStatus[]> = {
      [SyncStatus.IDLE]: [SyncStatus.SYNCING, SyncStatus.OFFLINE, SyncStatus.ERROR],
      [SyncStatus.SYNCING]: [SyncStatus.IDLE, SyncStatus.ERROR, SyncStatus.RECONNECTING],
      [SyncStatus.ERROR]: [SyncStatus.IDLE, SyncStatus.RECONNECTING, SyncStatus.OFFLINE],
      [SyncStatus.OFFLINE]: [SyncStatus.IDLE, SyncStatus.RECONNECTING],
      [SyncStatus.RECONNECTING]: [SyncStatus.IDLE, SyncStatus.SYNCING, SyncStatus.ERROR, SyncStatus.OFFLINE]
    };
    
    // Note: We can't validate transitions here since we're checking the new state,
    // but we can add logging or other validation as needed
  }
  
  private validateConnectionState(state: SyncState): void {
    if (state.connectionState.consecutiveFailures < 0) {
      throw new Error('Invalid consecutive failures count');
    }
    
    if (state.connectionState.averageLatency < 0) {
      throw new Error('Invalid average latency');
    }
  }
  
  private validateSyncProgress(state: SyncState): void {
    for (const [table, status] of state.tableSyncProgress) {
      if (status.progress < 0 || status.progress > 100) {
        throw new Error(`Invalid progress percentage for table ${table}: ${status.progress}`);
      }
      
      if (status.processedRecords > status.totalRecords && status.totalRecords > 0) {
        throw new Error(`Processed records exceeds total for table ${table}`);
      }
    }
  }
  
  private notifyListeners(prevState: SyncState, newState: SyncState): void {
    // Process listeners asynchronously to avoid blocking state updates
    setImmediate(() => {
      for (const listener of this.listeners) {
        try {
          listener(prevState, newState);
        } catch (error) {
          console.error('Error in state listener:', error);
        }
      }
    });
  }
}
```

### 3.2 State Validation and Integrity Checks

#### 3.2.1 Precondition and Postcondition Checks
```typescript
// In SyncEngine class
async processOperation(operation: SyncOperation): Promise<void> {
  // Precondition check
  await this.validateOperationPreconditions(operation);
  
  try {
    // Execute operation
    await this.executeOperationInternal(operation);
    
    // Postcondition check
    await this.validateOperationPostconditions(operation);
  } catch (error) {
    // Error postcondition check
    await this.validateOperationErrorPostconditions(operation, error);
    throw error;
  }
}

private async validateOperationPreconditions(operation: SyncOperation): Promise<void> {
  const state = await this.stateManager.getState();
  
  // Check that operation is valid for current state
  if (state.status === SyncStatus.OFFLINE && !operation.table.startsWith('local_')) {
    throw new Error('Cannot process server-bound operations while offline');
  }
  
  // Check that operation hasn't been processed already
  if (state.activeOperations.has(operation.id?.toString() || '')) {
    throw new Error(`Operation ${operation.id} is already active`);
  }
  
  // Add other preconditions as needed
}

private async validateOperationPostconditions(operation: SyncOperation): Promise<void> {
  // Verify that operation was processed correctly
  // This might involve checking database state, cache consistency, etc.
  
  // Example: Verify that the operation is no longer in active operations
  const state = await this.stateManager.getState();
  if (state.activeOperations.has(operation.id?.toString() || '')) {
    console.warn(`Operation ${operation.id} still marked as active after completion`);
  }
}
```

#### 3.2.2 Invariant Checking
```typescript
// In StateManager class
private checkInvariants(state: SyncState): void {
  // Invariant: Total operations should equal successful + failed
  if (state.syncMetrics.totalOperations !== 
      state.syncMetrics.successfulOperations + state.syncMetrics.failedOperations) {
    console.warn('Operations count invariant violated');
  }
  
  // Invariant: Active operations should not exceed reasonable limit
  if (state.activeOperations.size > 100) { // Arbitrary limit
    console.warn(`Too many active operations: ${state.activeOperations.size}`);
  }
  
  // Invariant: Connection quality should match connection state
  if (state.isOnline && state.connectionQuality === 'offline') {
    console.warn('Connection state and quality mismatch');
  }
  
  // Add other invariants as needed
}
```

### 3.3 Error Handling for Inconsistent States

#### 3.3.1 Graceful Degradation
```typescript
// In SyncManager class
async handleInconsistentState(error: Error, context: string): Promise<void> {
  console.error(`Inconsistent state detected in ${context}:`, error);
  
  try {
    // Attempt to restore consistent state
    await this.restoreConsistentState();
  } catch (restoreError) {
    console.error('Failed to restore consistent state:', restoreError);
    
    // Fallback: reset to known good state
    await this.resetToKnownGoodState();
  }
}

private async restoreConsistentState(): Promise<void> {
  // Example restoration logic
  await this.stateManager.updateState(state => ({
    ...state,
    status: SyncStatus.IDLE,
    activeOperations: new Set(),
    tableSyncProgress: new Map()
  }));
  
  // Clear problematic caches
  await this.clearProblematicCaches();
}

private async resetToKnownGoodState(): Promise<void> {
  // Reset to a completely clean state
  await this.stateManager.updateState(state => ({
    ...this.stateManager.createInitialState(),
    isOnline: state.isOnline, // Preserve connection status
    connectionState: state.connectionState
  }));
}
```

#### 3.3.2 State Recovery Mechanisms
```typescript
// In StateManager class
async saveStateSnapshot(label: string): Promise<void> {
  const state = this.getState();
  const snapshot = {
    label,
    timestamp: new Date(),
    state: this.serializeState(state)
  };
  
  // Store in persistent storage
  localStorage.setItem(`sync_state_snapshot_${label}`, JSON.stringify(snapshot));
}

async restoreFromSnapshot(label: string): Promise<boolean> {
  const snapshotStr = localStorage.getItem(`sync_state_snapshot_${label}`);
  if (!snapshotStr) {
    return false;
  }
  
  try {
    const snapshot = JSON.parse(snapshotStr);
    const deserializedState = this.deserializeState(snapshot.state);
    
    await this.updateState(() => deserializedState);
    return true;
  } catch (error) {
    console.error('Failed to restore state from snapshot:', error);
    return false;
  }
}

private serializeState(state: SyncState): any {
  // Serialize state to JSON-safe format
  return {
    ...state,
    tableSyncProgress: Array.from(state.tableSyncProgress.entries()),
    activeOperations: Array.from(state.activeOperations),
    lastSyncTimes: Array.from(state.lastSyncTimes.entries()),
    scheduledSyncs: [], // Don't serialize timeouts
    retryDelays: Array.from(state.retryDelays.entries()),
    syncCache: [], // Don't serialize cache (volatile)
    compressionCache: [], // Don't serialize cache (volatile)
    lastUserActivity: state.lastUserActivity.toISOString(),
    performanceHistory: state.performanceHistory.map(p => ({
      ...p,
      timestamp: p.timestamp.toISOString()
    }))
  };
}

private deserializeState(serialized: any): SyncState {
  // Deserialize from JSON format
  return {
    ...serialized,
    tableSyncProgress: new Map(serialized.tableSyncProgress),
    activeOperations: new Set(serialized.activeOperations),
    lastSyncTimes: new Map(serialized.lastSyncTimes),
    scheduledSyncs: new Map(), // Timeouts can't be serialized
    retryDelays: new Map(serialized.retryDelays),
    syncCache: new Map(), // Recreate empty cache
    compressionCache: new Map(), // Recreate empty cache
    lastUserActivity: new Date(serialized.lastUserActivity),
    performanceHistory: serialized.performanceHistory.map((p: any) => ({
      ...p,
      timestamp: new Date(p.timestamp)
    }))
  };
}
```

## 4. Asynchronous Operation Coordination

### 4.1 Promise-Based Coordination
```typescript
// In OperationQueue class
class OperationCoordinator {
  private pendingOperations: Map<string, {
    promise: Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    createdAt: Date;
  }> = new Map();
  
  async executeWithCoordination<T>(
    operationId: string, 
    executor: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    // Check if operation is already pending
    if (this.pendingOperations.has(operationId)) {
      const existing = this.pendingOperations.get(operationId)!;
      
      // Check if existing operation is taking too long
      const age = Date.now() - existing.createdAt.getTime();
      if (age > timeoutMs) {
        // Cancel the old operation
        existing.reject(new Error(`Operation ${operationId} timed out`));
        this.pendingOperations.delete(operationId);
      } else {
        // Wait for the existing operation to complete
        return existing.promise;
      }
    }
    
    // Create new coordinated operation
    let resolveFn: (value: any) => void;
    let rejectFn: (reason: any) => void;
    
    const promise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    
    this.pendingOperations.set(operationId, {
      promise,
      resolve: resolveFn!,
      reject: rejectFn!,
      createdAt: new Date()
    });
    
    try {
      const result = await executor();
      this.pendingOperations.get(operationId)?.resolve(result);
      return result;
    } catch (error) {
      this.pendingOperations.get(operationId)?.reject(error);
      throw error;
    } finally {
      this.pendingOperations.delete(operationId);
    }
  }
}
```

### 4.2 Cancellation Token Support
```typescript
// In SyncEngine class
interface CancellationToken {
  isCancelled: boolean;
  cancel(): void;
  onCancellation(callback: () => void): void;
}

class CancellationTokenSource {
  private cancelled = false;
  private callbacks: Array<() => void> = [];
  
  getToken(): CancellationToken {
    return {
      get isCancelled() { return this.cancelled; },
      cancel: this.cancel.bind(this),
      onCancellation: this.onCancellation.bind(this)
    };
  }
  
  private cancel(): void {
    if (!this.cancelled) {
      this.cancelled = true;
      for (const callback of this.callbacks) {
        callback();
      }
      this.callbacks = [];
    }
  }
  
  private onCancellation(callback: () => void): void {
    if (this.cancelled) {
      callback();
    } else {
      this.callbacks.push(callback);
    }
  }
}

// Usage in sync operations
async syncWithCancellation(cancellationToken: CancellationToken): Promise<void> {
  cancellationToken.onCancellation(() => {
    console.log('Sync operation cancelled');
    // Perform cleanup if needed
  });
  
  if (cancellationToken.isCancelled) {
    throw new Error('Operation cancelled before start');
  }
  
  // Perform sync operation with periodic cancellation checks
  for (const table of this.getSyncableTables()) {
    if (cancellationToken.isCancelled) {
      throw new Error('Operation cancelled during sync');
    }
    
    await this.pullTableFromServer(table);
  }
}
```

## 5. State Persistence and Recovery

### 5.1 Periodic State Persistence
```typescript
// In StateManager class
private persistenceTimer: NodeJS.Timeout | null = null;

async startPeriodicPersistence(intervalMs: number = 30000): Promise<void> {
  if (this.persistenceTimer) {
    clearInterval(this.persistenceTimer);
  }
  
  this.persistenceTimer = setInterval(async () => {
    try {
      await this.persistState();
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }, intervalMs);
}

async persistState(): Promise<void> {
  const state = this.getState();
  const serializableState = this.makeSerializable(state);
  
  try {
    localStorage.setItem('sync_manager_state', JSON.stringify(serializableState));
  } catch (error) {
    console.error('Failed to persist state to localStorage:', error);
  }
}

async restorePersistedState(): Promise<boolean> {
  try {
    const persistedStr = localStorage.getItem('sync_manager_state');
    if (!persistedStr) {
      return false;
    }
    
    const persistedState = JSON.parse(persistedStr);
    const restoredState = this.makeRestorable(persistedState);
    
    // Only restore certain state properties (not volatile ones)
    await this.updateState(currentState => ({
      ...currentState,
      lastSyncTimes: restoredState.lastSyncTimes,
      syncMetrics: restoredState.syncMetrics,
      lastUserActivity: restoredState.lastUserActivity,
      performanceHistory: restoredState.performanceHistory
    }));
    
    return true;
  } catch (error) {
    console.error('Failed to restore persisted state:', error);
    return false;
  }
}

private makeSerializable(state: SyncState): any {
  // Exclude non-serializable properties
  const { scheduledSyncs, syncCache, compressionCache, ...serializable } = state;
  return {
    ...serializable,
    tableSyncProgress: Array.from(state.tableSyncProgress.entries()),
    activeOperations: Array.from(state.activeOperations),
    lastSyncTimes: Array.from(state.lastSyncTimes.entries()),
    retryDelays: Array.from(state.retryDelays.entries()),
    lastUserActivity: state.lastUserActivity.toISOString(),
    performanceHistory: state.performanceHistory.map(p => ({
      ...p,
      timestamp: p.timestamp.toISOString()
    }))
  };
}

private makeRestorable(serialized: any): SyncState {
  return {
    ...serialized,
    tableSyncProgress: new Map(serialized.tableSyncProgress),
    activeOperations: new Set(serialized.activeOperations),
    lastSyncTimes: new Map(serialized.lastSyncTimes),
    scheduledSyncs: new Map(), // Cannot restore timeouts
    retryDelays: new Map(serialized.retryDelays),
    syncCache: new Map(), // Recreate empty cache
    compressionCache: new Map(), // Recreate empty cache
    lastUserActivity: new Date(serialized.lastUserActivity),
    performanceHistory: serialized.performanceHistory.map((p: any) => ({
      ...p,
      timestamp: new Date(p.timestamp)
    })),
    // Restore non-serialized defaults
    status: SyncStatus.IDLE,
    isOnline: navigator.onLine,
    initialSyncInProgress: false,
    connectionState: {
      isOnline: navigator.onLine,
      quality: 'good',
      lastCheck: new Date(),
      consecutiveFailures: 0,
      averageLatency: 0
    },
    connectionQuality: 'good',
    currentSyncInterval: 3600000,
    consecutiveFailures: 0,
    isActive: true
  };
}
```

### 5.2 Crash Recovery
```typescript
// In SyncManager initialization
async initializeWithRecovery(): Promise<void> {
  // Attempt to restore from persisted state
  const restored = await this.stateManager.restorePersistedState();
  
  if (restored) {
    console.log('Recovered state from previous session');
    
    // Clean up any operations that were in progress during crash
    await this.cleanupCrashedOperations();
  } else {
    console.log('Starting with fresh state');
  }
  
  // Set up crash recovery hooks
  this.setupCrashRecoveryHooks();
}

private setupCrashRecoveryHooks(): void {
  // Save state before page unload
  window.addEventListener('beforeunload', async () => {
    try {
      await this.stateManager.persistState();
    } catch (error) {
      console.error('Failed to persist state before unload:', error);
    }
  });
  
  // Save state on visibility change (when tab goes to background)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      try {
        await this.stateManager.persistState();
      } catch (error) {
        console.error('Failed to persist state on visibility change:', error);
      }
    }
  });
}

private async cleanupCrashedOperations(): Promise<void> {
  // Mark any operations that were in progress as failed
  await this.stateManager.updateState(state => {
    // Reset progress indicators
    const resetProgress = new Map(state.tableSyncProgress);
    for (const [table, status] of resetProgress) {
      if (status.inProgress) {
        resetProgress.set(table, {
          ...status,
          inProgress: false,
          progress: 0
        });
      }
    }
    
    return {
      ...state,
      tableSyncProgress: resetProgress,
      activeOperations: new Set()
    };
  });
  
  // Clear any corrupted queue entries
  await this.queueManager.clearCorruptedEntries();
}
```

## 6. Monitoring and Debugging

### 6.1 State Change Logging
```typescript
// In StateManager class
private logger: StateLogger;

async updateStateWithLogging(updater: (state: SyncState) => SyncState, context: string): Promise<void> {
  const prevState = this.getState();
  const prevStatus = prevState.status;
  
  await this.updateState(updater);
  
  const newState = this.getState();
  const newStatus = newState.status;
  
  // Log significant state changes
  if (prevStatus !== newStatus) {
    this.logger.logStatusChange(prevStatus, newStatus, context);
  }
  
  // Log other important changes
  if (prevState.isOnline !== newState.isOnline) {
    this.logger.logConnectivityChange(prevState.isOnline, newState.isOnline, context);
  }
  
  if (prevState.initialSyncInProgress !== newState.initialSyncInProgress) {
    this.logger.logInitialSyncChange(
      prevState.initialSyncInProgress, 
      newState.initialSyncInProgress, 
      context
    );
  }
}

class StateLogger {
  private logBuffer: StateChangeEvent[] = [];
  private maxBufferSize = 1000;
  
  logStatusChange(from: SyncStatus, to: SyncStatus, context: string): void {
    this.addEvent({
      type: 'status_change',
      timestamp: new Date(),
      from,
      to,
      context
    });
  }
  
  logConnectivityChange(from: boolean, to: boolean, context: string): void {
    this.addEvent({
      type: 'connectivity_change',
      timestamp: new Date(),
      from,
      to,
      context
    });
  }
  
  getRecentEvents(limit: number = 100): StateChangeEvent[] {
    return this.logBuffer.slice(-limit);
  }
  
  getEventsByType(type: string, limit: number = 100): StateChangeEvent[] {
    return this.logBuffer
      .filter(event => event.type === type)
      .slice(-limit);
  }
  
  private addEvent(event: StateChangeEvent): void {
    this.logBuffer.push(event);
    
    // Trim buffer if too large
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
  }
}

interface StateChangeEvent {
  type: string;
  timestamp: Date;
  from?: any;
  to?: any;
  context: string;
}
```

### 6.2 Diagnostic Tools
```typescript
// In SyncManager class
getDiagnosticReport(): DiagnosticReport {
  const state = this.stateManager.getState();
  
  return {
    timestamp: new Date(),
    stateSummary: this.getStateSummary(state),
    performanceMetrics: this.getPerformanceMetrics(state),
    errorHistory: this.getErrorHistory(),
    resourceUsage: this.getResourceUsage(),
    configuration: this.getCurrentConfiguration()
  };
}

private getStateSummary(state: SyncState): StateSummary {
  return {
    status: state.status,
    isOnline: state.isOnline,
    connectionQuality: state.connectionQuality,
    activeOperations: state.activeOperations.size,
    tablesInProgress: Array.from(state.tableSyncProgress.entries())
      .filter(([_, status]) => status.inProgress)
      .map(([table, _]) => table),
    queueSize: this.queueManager.getSize(),
    cacheSizes: {
      syncCache: state.syncCache.size,
      compressionCache: state.compressionCache.size
    }
  };
}

private getPerformanceMetrics(state: SyncState): PerformanceMetrics {
  const recentHistory = state.performanceHistory.slice(-10); // Last 10 syncs
  
  if (recentHistory.length === 0) {
    return {
      averageSyncTime: 0,
      syncTimeStdDev: 0,
      throughput: 0,
      recentSyncTimes: []
    };
  }
  
  const avgTime = recentHistory.reduce((sum, perf) => sum + perf.duration, 0) / recentHistory.length;
  const syncTimes = recentHistory.map(perf => perf.duration);
  
  return {
    averageSyncTime: avgTime,
    syncTimeStdDev: this.calculateStdDev(syncTimes, avgTime),
    throughput: this.calculateThroughput(recentHistory),
    recentSyncTimes: syncTimes
  };
}

// Additional diagnostic methods...
```

This comprehensive document outlines detailed strategies for preventing race conditions and managing state effectively in the refactored SyncManager system. The implementation focuses on centralized state management, proper locking mechanisms, transaction support, and robust error handling to ensure the system remains consistent and reliable even under concurrent operations.