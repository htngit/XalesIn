# Comprehensive Refactoring Plan: SyncManager.ts with Enhanced State Management and Race Condition Prevention

## 1. Executive Summary

This document outlines a comprehensive refactoring plan for the SyncManager.ts file, which currently spans 2,158 lines of code. The goal is to decompose this monolithic class into a modular, maintainable, and testable architecture that follows SOLID principles and separation of concerns, with a strong focus on state management and race condition prevention.

The refactoring will transform the current single class into 12 specialized modules, each with a clear responsibility and robust state management capabilities. This will improve code readability, maintainability, testability, and enable better team collaboration while preventing race conditions and ensuring state consistency.

## 2. Current State Analysis

### 2.1 File Statistics
- **Lines of Code**: 2,158 lines
- **Primary Class**: `SyncManager`
- **Exported Instance**: `syncManager = new SyncManager()`

### 2.2 Key Functional Areas Identified
- Event management and listeners
- Online/offline detection and connection quality monitoring
- Sync scheduling and automation
- Data synchronization operations (push/pull)
- Conflict resolution strategies
- Queue management and prioritization
- Performance metrics and monitoring
- Data validation and normalization
- Compression and caching mechanisms
- Table mapping and schema management
- Error handling and retry mechanisms
- Cleanup and maintenance operations

### 2.3 Current State Management Patterns
- **Shared State**: Multiple properties like `_isInitialSyncInProgress`, `_tableSyncInProgress`, `status`, `isOnline`, etc.
- **In-Memory State**: Metrics, caches, connection state, activity tracking
- **Persistent State**: Last sync times stored in localStorage
- **Event-Based State**: Event listeners and emitter pattern

### 2.4 Potential Race Conditions Identified
- **Concurrent Sync Operations**: Multiple table syncs happening simultaneously
- **Initial Sync Interference**: Initial sync and auto-sync potentially running concurrently
- **Queue Processing**: Multiple operations processing simultaneously
- **Cache Access**: Multiple modules accessing shared caches without coordination
- **Database Transactions**: Async operations without atomicity guarantees
- **Event Emission**: Events emitted during state transitions causing unexpected behavior

## 3. Problems with Current State Management

### 3.1 State Consistency Issues
- **Scattered State**: State is distributed across multiple properties without centralized management
- **Inconsistent Updates**: State updates happen in multiple places without coordination
- **Race Conditions**: Concurrent operations can lead to inconsistent state

### 3.2 Lack of Synchronization Primitives
- **No Locking Mechanisms**: No protection against concurrent access to shared resources
- **No Transaction Support**: Multi-step operations lack atomicity
- **No Event Ordering**: Events can arrive out of sequence causing issues

### 3.3 Poor State Visibility
- **Hidden State Transitions**: State changes happen without proper logging or monitoring
- **Difficult Debugging**: Hard to trace state evolution over time
- **No State Validation**: No checks to ensure state remains valid

## 4. Proposed Solution: Modular Architecture with Robust State Management

The refactoring will decompose the SyncManager into 12 specialized modules with enhanced state management:

### 4.1 Module Architecture Overview
```
src/lib/sync/
├── index.ts                          # Main export module
├── SyncManager.ts                    # Orchestrator class (reduced responsibility)
├── core/
│   ├── SyncEngine.ts                 # Core sync logic with state management
│   ├── OperationQueue.ts             # Queue management with locking
│   └── StateManager.ts               # Centralized state management
├── network/
│   ├── ConnectionMonitor.ts          # Online/offline detection
│   └── NetworkQuality.ts             # Connection quality assessment
├── conflict/
│   ├── ConflictResolver.ts           # Conflict detection and resolution
│   └── MergeStrategies.ts            # Data merging algorithms
├── scheduling/
│   ├── SyncScheduler.ts              # Automatic sync scheduling
│   └── ActivityDetector.ts           # User activity-based sync adjustments
├── utils/
│   ├── MetricsCollector.ts           # Performance metrics
│   ├── DataValidator.ts              # Data validation utilities
│   ├── DataNormalizer.ts             # Data normalization utilities
│   └── CompressionHandler.ts         # Data compression/decompression
```

## 5. Detailed Breakdown of New Modules with State Management Focus

### 5.1 StateManager (New Core Module)
**Responsibility**: Centralized state management with locking and validation
**Lines of Code Target**: 300-400 lines
**Key Functions**:
- **Centralized State Storage**: Single source of truth for all sync-related state
- **Thread-Safe Operations**: Locking mechanisms for concurrent access
- **State Validation**: Ensure state remains consistent and valid
- **State Persistence**: Save/load state to/from storage
- **State Change Notifications**: Emit events when state changes occur
- **Transaction Support**: Group related state changes atomically

**perlu check aktual di supabase**: Need to verify what state needs to be persisted in Supabase vs local storage

```typescript
// Example state management interface
interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  initialSyncInProgress: boolean;
  tableSyncProgress: Map<string, boolean>;
  connectionState: ConnectionState;
  syncMetrics: SyncMetrics;
  lastSyncTimes: Map<string, string>;
  activeOperations: Set<string>;
  locks: Map<string, Promise<void>>;
}

class StateManager {
  private state: SyncState;
  private stateLock: Mutex; // Mutual exclusion for state updates
  
  async updateState(updater: (state: SyncState) => SyncState): Promise<void>;
  async withLock<T>(resource: string, fn: () => Promise<T>): Promise<T>;
  async transaction<T>(operations: Array<() => Promise<void>>): Promise<T>;
  subscribe(listener: (prevState: SyncState, newState: SyncState) => void): () => void;
}
```

### 5.2 SyncManager (Orchestrator)
**Responsibility**: Coordinate between all modules, maintain public API
**Lines of Code Target**: 200-300 lines
**Enhanced with State Management**:
- **State Coordination**: Use StateManager for all state operations
- **Race Condition Prevention**: Proper locking for critical sections
- **Event Ordering**: Ensure events are processed in correct sequence
- **Error Recovery**: Handle inconsistent states gracefully

### 5.3 SyncEngine
**Responsibility**: Core sync operations (push/pull) with state awareness
**Lines of Code Target**: 400-500 lines
**Enhanced with State Management**:
- **Operation State Tracking**: Track individual operation states
- **Critical Section Protection**: Lock resources during sync operations
- **Atomic Operations**: Group related operations into transactions
- **State Validation**: Validate state before and after operations

### 5.4 OperationQueue
**Responsibility**: Queue management and prioritization with locking
**Lines of Code Target**: 250-300 lines
**Enhanced with State Management**:
- **Queue State Management**: Maintain queue state with proper locking
- **Concurrency Control**: Prevent multiple consumers from processing same items
- **Transaction Support**: Atomic queue operations (add/remove/batch)
- **State Consistency**: Ensure queue state remains consistent

### 5.5 ConnectionMonitor
**Responsibility**: Online/offline detection with state management
**Lines of Code Target**: 150-200 lines
**Enhanced with State Management**:
- **Connection State Tracking**: Maintain connection state with validation
- **State Transition Guards**: Prevent invalid state transitions
- **Event Ordering**: Ensure connection events are processed in order

### 5.6 SyncScheduler
**Responsibility**: Automatic sync scheduling with state coordination
**Lines of Code Target**: 200-250 lines
**Enhanced with State Management**:
- **Schedule State Management**: Track scheduled operations with locking
- **Concurrent Schedule Prevention**: Prevent overlapping schedules
- **State-Based Scheduling**: Adjust schedule based on current state

## 6. State Management and Race Condition Prevention Strategies

### 6.1 Centralized State Management
- **Single Source of Truth**: All state managed through StateManager
- **Immutable State Updates**: Use functional updates to prevent mutations
- **State Validation**: Validate state after each update
- **State Snapshots**: Create snapshots for debugging and recovery

### 6.2 Locking Strategies
- **Mutex for Critical Sections**: Prevent concurrent access to shared resources
- **Resource-Level Locking**: Lock specific resources (tables, operations)
- **Timeout-Based Locking**: Prevent deadlocks with timeouts
- **Try-Lock Mechanisms**: Non-blocking alternatives for performance

### 6.3 Transaction Support
- **Multi-Step Operations**: Group related operations atomically
- **Rollback Capability**: Undo operations on failure
- **Isolation Levels**: Prevent intermediate states from being observed
- **Consistency Guarantees**: Ensure state remains consistent

### 6.4 Event Ordering and Sequencing
- **Sequential Event Processing**: Process events in order of arrival
- **Event Batching**: Group related events for atomic processing
- **Dependency Tracking**: Ensure dependent events are processed in order
- **Event Validation**: Validate event sequences for correctness

### 6.5 State Validation and Integrity Checks
- **Precondition Checks**: Validate state before operations
- **Postcondition Checks**: Validate state after operations
- **Invariant Checking**: Ensure state invariants are maintained
- **Consistency Verification**: Regular checks for state consistency

### 6.6 Error Handling for Inconsistent States
- **Graceful Degradation**: Continue operation despite state inconsistencies
- **State Recovery**: Restore consistent state from backups
- **Error Isolation**: Prevent errors from propagating to other components
- **Fallback Mechanisms**: Alternative paths when state is inconsistent

### 6.7 Asynchronous Operation Coordination
- **Promise-Based Coordination**: Use promises for async operation coordination
- **Cancellation Tokens**: Cancel operations when state changes
- **Timeout Handling**: Handle operations that exceed time limits
- **Retry Logic**: Retry operations with exponential backoff

### 6.8 State Persistence and Recovery
- **Periodic State Persistence**: Save state to storage regularly
- **Crash Recovery**: Restore state after application crashes
- **State Migration**: Handle state schema changes
- **Backup and Restore**: Maintain state backups for disaster recovery

### 6.9 Monitoring and Debugging
- **State Change Logging**: Log all state changes for debugging
- **Performance Monitoring**: Track state operation performance
- **Health Checks**: Monitor state system health
- **Diagnostic Tools**: Tools for state inspection and debugging

## 7. Implementation Details for State Management

### 7.1 StateManager Implementation
```typescript
import { Mutex } from 'async-mutex';

interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  initialSyncInProgress: boolean;
  tableSyncProgress: Map<string, boolean>;
  connectionState: ConnectionState;
  syncMetrics: SyncMetrics;
  lastSyncTimes: Map<string, string>;
  activeOperations: Set<string>;
  retryDelays: Map<string, number>;
  syncCache: Map<string, any>;
  compressionCache: Map<string, string>;
}

class StateManager {
  private state: SyncState;
  private mutex: Mutex;
  private listeners: Array<(prevState: SyncState, newState: SyncState) => void>;
  
  constructor(initialState: Partial<SyncState> = {}) {
    this.state = {
      status: SyncStatus.IDLE,
      isOnline: navigator.onLine,
      initialSyncInProgress: false,
      tableSyncProgress: new Map(),
      connectionState: {
        isOnline: navigator.onLine,
        quality: 'good',
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageLatency: 0
      },
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
      lastSyncTimes: new Map(),
      activeOperations: new Set(),
      retryDelays: new Map(),
      syncCache: new Map(),
      compressionCache: new Map(),
      ...initialState
    };
    this.mutex = new Mutex();
    this.listeners = [];
  }
  
  async updateState(updater: (state: SyncState) => SyncState): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const prevState = { ...this.state };
      this.state = updater({ ...this.state });
      
      // Validate state after update
      this.validateState(this.state);
      
      // Notify listeners
      this.notifyListeners(prevState, this.state);
    } finally {
      release();
    }
  }
  
  getState(): SyncState {
    return { ...this.state };
  }
  
  async withLock<T>(resource: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
  
  private validateState(state: SyncState): void {
    // Add validation logic here
    if (state.connectionState.consecutiveFailures < 0) {
      throw new Error('Invalid consecutive failures count');
    }
    
    // Add more validation rules as needed
  }
  
  private notifyListeners(prevState: SyncState, newState: SyncState): void {
    this.listeners.forEach(listener => {
      try {
        listener(prevState, newState);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
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
}
```

### 7.2 Resource-Level Locking
```typescript
class ResourceLockManager {
  private locks: Map<string, Mutex> = new Map();
  
  async acquire(resourceId: string): Promise<() => void> {
    if (!this.locks.has(resourceId)) {
      this.locks.set(resourceId, new Mutex());
    }
    
    const mutex = this.locks.get(resourceId)!;
    const release = await mutex.acquire();
    
    return () => {
      release();
      // Optionally clean up unused locks
      if (mutex.isLocked() === false) {
        this.locks.delete(resourceId);
      }
    };
  }
}
```

### 7.3 Transaction Support
```typescript
class TransactionManager {
  private activeTransactions: Set<string> = new Set();
  
  async executeTransaction<T>(
    id: string, 
    operations: Array<() => Promise<void>>, 
    rollbackOperations?: Array<() => Promise<void>>
  ): Promise<T> {
    if (this.activeTransactions.has(id)) {
      throw new Error(`Transaction ${id} is already active`);
    }
    
    this.activeTransactions.add(id);
    
    try {
      for (const operation of operations) {
        await operation();
      }
      
      // Transaction completed successfully
      this.activeTransactions.delete(id);
      return {} as T; // Return appropriate result
    } catch (error) {
      // Attempt rollback if rollback operations provided
      if (rollbackOperations) {
        for (const rollbackOp of [...rollbackOperations].reverse()) {
          try {
            await rollbackOp();
          } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
          }
        }
      }
      
      this.activeTransactions.delete(id);
      throw error;
    }
  }
}
```

## 8. File Organization and Naming Conventions

### 8.1 Directory Structure
```
src/lib/sync/
├── index.ts                          # Export all public interfaces
├── SyncManager.ts                    # Main orchestrator
├── core/
│   ├── SyncEngine.ts
│   ├── OperationQueue.ts
│   ├── StateManager.ts               # New state management module
│   └── types.ts                      # Shared types for core module
├── network/
│   ├── ConnectionMonitor.ts
│   ├── NetworkQuality.ts
│   └── types.ts                      # Shared types for network module
├── conflict/
│   ├── ConflictResolver.ts
│   ├── MergeStrategies.ts
│   └── types.ts                      # Shared types for conflict module
├── scheduling/
│   ├── SyncScheduler.ts
│   ├── ActivityDetector.ts
│   └── types.ts                      # Shared types for scheduling module
├── utils/
│   ├── MetricsCollector.ts
│   ├── DataValidator.ts
│   ├── DataNormalizer.ts
│   ├── CompressionHandler.ts
│   └── types.ts                      # Shared types for utils module
└── constants.ts                      # Shared constants across all modules
```

### 8.2 Naming Conventions
- **Classes**: PascalCase (e.g., `SyncEngine`, `StateManager`)
- **Interfaces**: PascalCase prefixed with 'I' (e.g., `ISyncOperation`)
- **Enums**: PascalCase (e.g., `SyncStatus`)
- **Functions**: camelCase (e.g., `normalizeTimestamp`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SYNC_INTERVAL_DEFAULT`)
- **Files**: PascalCase matching primary class/export

## 9. Dependency Graph Between New Modules

```
SyncManager (Orchestrator)
├── StateManager (Central state management)
├── SyncEngine
│   ├── OperationQueue
│   ├── ConflictResolver
│   ├── DataValidator
│   ├── DataNormalizer
│   └── CompressionHandler
├── ConnectionMonitor
├── NetworkQuality
├── SyncScheduler
│   └── ActivityDetector
├── MetricsCollector
└── DataValidator (direct import for validation)
```

### 9.1 Dependency Rules
- **Core modules** can depend on **utils** modules
- **Network modules** should not depend on **core** modules
- **Scheduling modules** can depend on **network** modules
- **Utils modules** should have minimal dependencies
- **Circular dependencies** are strictly prohibited
- **State management** is centralized in StateManager

## 10. Step-by-Step Refactoring Process (5 Phases)

### Phase 1: Foundation Setup (Week 1)
**Objective**: Establish module structure and implement state management foundation

#### Week 1, Day 1-2: Create Directory Structure and StateManager
```bash
mkdir -p src/lib/sync/{core,network,conflict,scheduling,utils}
```

#### Week 1, Day 3-5: Implement StateManager
1. Create `StateManager.ts` with centralized state management
2. Implement mutex-based locking for critical sections
3. Add state validation and integrity checks
4. Implement transaction support
5. Add event notification system

#### Week 1, Day 6-7: Extract Utility Modules with State Awareness
1. Create `DataValidator.ts` with validation state tracking
2. Create `DataNormalizer.ts` with normalization state
3. Create `CompressionHandler.ts` with compression state management
4. Update imports in original SyncManager to use StateManager

### Phase 2: Core Components with State Management (Week 2)
**Objective**: Extract core sync logic with proper state management

#### Week 2, Day 1-3: Implement OperationQueue with Locking
1. Move queue-related methods to `OperationQueue.ts`
2. Implement resource-level locking for queue operations
3. Add transaction support for batch operations
4. Handle retry mechanisms with state tracking

#### Week 2, Day 4-7: Implement SyncEngine with State Coordination
1. Move core sync operations (push/pull) to `SyncEngine.ts`
2. Integrate with StateManager for operation state tracking
3. Implement critical section protection for sync operations
4. Add atomic operation support for multi-step syncs

### Phase 3: Infrastructure Components (Week 3)
**Objective**: Extract network and scheduling components with state awareness

#### Week 3, Day 1-2: Extract Network Components with State Management
1. Create `ConnectionMonitor.ts` with connection state tracking
2. Create `NetworkQuality.ts` with quality state management
3. Implement state-based event ordering
4. Add connection state validation

#### Week 3, Day 3-4: Extract Scheduling Components with State Coordination
1. Create `SyncScheduler.ts` with schedule state management
2. Create `ActivityDetector.ts` with activity state tracking
3. Implement state-based scheduling adjustments
4. Add concurrency control for scheduled operations

#### Week 3, Day 5-7: Extract Conflict Resolution with State Tracking
1. Create `ConflictResolver.ts` with conflict state management
2. Create `MergeStrategies.ts` with merge state tracking
3. Implement state validation for conflict resolution
4. Add transaction support for merge operations

### Phase 4: Integration and State Coordination (Week 4)
**Objective**: Complete integration with comprehensive state management

#### Week 4, Day 1-3: Update Main SyncManager with State Coordination
1. Replace internal state with StateManager dependencies
2. Maintain backward-compatible public API
3. Implement proper error handling between modules
4. Add state-based operation coordination

#### Week 4, Day 4-5: Enhance Metrics and Monitoring with State Tracking
1. Create `MetricsCollector.ts` with metric state management
2. Integrate metrics collection across all modules
3. Add state-based performance monitoring
4. Implement diagnostic tools for state inspection

#### Week 4, Day 6-7: Final State Management Integration
1. Ensure all modules properly use StateManager
2. Implement comprehensive state validation
3. Add state persistence and recovery mechanisms
4. Test state management under various conditions

### Phase 5: Race Condition Prevention and Testing (Week 5)
**Objective**: Implement comprehensive race condition prevention and testing

#### Week 5, Day 1-2: Implement Advanced Locking Strategies
1. Add resource-level locking for table operations
2. Implement timeout-based locks to prevent deadlocks
3. Add try-lock mechanisms for performance
4. Test locking under concurrent operations

#### Week 5, Day 3-4: Implement Transaction Support for Critical Operations
1. Add transaction support for multi-table operations
2. Implement rollback mechanisms for failed operations
3. Add isolation levels for concurrent operations
4. Test transaction behavior under failure conditions

#### Week 5, Day 5-7: Comprehensive Testing and Validation
1. Test race condition prevention mechanisms
2. Validate state consistency under concurrent operations
3. Test error recovery from inconsistent states
4. Performance testing with state management overhead

## 11. Risk Assessment and Mitigation Strategies

### 11.1 High-Risk Areas
- **State Consistency**: Risk of introducing new state inconsistency bugs
- **Performance Degradation**: Risk of slower operations due to locking overhead
- **Deadlock Possibilities**: Risk of deadlocks with new locking mechanisms
- **Complexity Increase**: Risk of making code harder to understand

### 11.2 Mitigation Strategies
- **Comprehensive Testing**: Implement extensive unit and integration tests
- **Gradual Migration**: Phase-by-phase refactoring with continuous validation
- **Performance Baseline**: Establish performance benchmarks before refactoring
- **Resource Management**: Implement proper cleanup mechanisms
- **Code Reviews**: Mandatory peer reviews for all changes

### 11.3 Rollback Procedures
- **Version Control**: Maintain git branches for each phase
- **Feature Flags**: Use flags to enable/disable refactored code
- **Monitoring**: Implement logging to detect issues quickly
- **Backup**: Maintain original code until full validation

## 12. Testing Strategy for Refactored Code with State Management

### 12.1 Unit Testing
- Each module should have 100% unit test coverage
- Test all state management functions and edge cases
- Mock external dependencies (database, network, etc.)
- Test race condition scenarios with concurrent operations

### 12.2 Integration Testing
- Test module interactions with state coordination
- Verify state consistency across module boundaries
- Test error propagation and handling with state recovery
- Test locking mechanisms under concurrent access

### 12.3 End-to-End Testing
- Full sync operation testing with state tracking
- Conflict resolution scenarios with state validation
- Performance under various network conditions with state monitoring
- Race condition prevention testing with concurrent operations

### 12.4 Stress Testing
- Concurrent sync operations testing
- High-load state management testing
- Long-running operation state consistency testing
- Memory leak detection with state management

## 13. Expected Benefits of Refactored Approach

### 13.1 Improved State Management
- **Centralized State**: Single source of truth for all sync-related state
- **Consistent Updates**: Properly coordinated state changes
- **Race Condition Prevention**: Robust locking and coordination mechanisms
- **Easy Debugging**: Clear state transition tracking

### 13.2 Enhanced Maintainability
- **Modular Design**: Each module has a single, clear responsibility
- **Easier Debugging**: Issues can be isolated to specific modules
- **Faster Onboarding**: New developers can focus on specific modules

### 13.3 Better Performance
- **Optimized Locking**: Minimal locking overhead with targeted locks
- **Reduced Memory Footprint**: Smaller, focused classes
- **Parallel Processing**: Modules can be optimized individually

### 13.4 Increased Reliability
- **State Consistency**: Guaranteed consistency with proper validation
- **Error Recovery**: Robust recovery from inconsistent states
- **Transaction Support**: Atomic operations for critical workflows

## 14. Code Quality Metrics Improvement Targets

### 14.1 Maintainability Metrics
- **Lines of Code per File**: Reduce from 2,158 to <300 per file
- **Cyclomatic Complexity**: Reduce average complexity by 60%
- **Coupling**: Minimize inter-module dependencies
- **Cohesion**: Maximize intra-module cohesion

### 14.2 Performance Metrics
- **Load Time**: Improve initialization time by 20%
- **Memory Usage**: Reduce peak memory consumption by 15%
- **Sync Speed**: Maintain or improve sync operation speed
- **Locking Overhead**: Keep locking overhead <5% of operation time

### 14.3 Test Coverage Metrics
- **Unit Test Coverage**: Achieve 90%+ coverage per module
- **Integration Test Coverage**: Cover all module interactions
- **Race Condition Tests**: Specific tests for concurrent operations
- **State Validation Tests**: Tests for state consistency

### 14.4 Reliability Metrics
- **State Consistency**: Zero inconsistent state occurrences in testing
- **Deadlock Prevention**: Zero deadlocks in stress testing
- **Recovery Time**: Sub-second recovery from state errors
- **Transaction Success Rate**: >99% success rate for multi-step operations

This comprehensive refactoring plan provides a roadmap for transforming the monolithic SyncManager.ts file into a well-structured, maintainable, and scalable modular architecture with robust state management and race condition prevention while preserving all existing functionality.