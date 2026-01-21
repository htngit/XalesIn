# **Keytar Migration Guide**

## **Table of Contents**
1. [Project Overview](#project-overview)
2. [Migration Objectives](#migration-objectives)
3. [Impact Analysis](#impact-analysis)
4. [Migration Sequence](#migration-sequence)
5. [Affected Files](#affected-files)
6. [Implementation Steps](#implementation-steps)
7. [Testing Strategy](#testing-strategy)
8. [Risk Mitigation](#risk-mitigation)
9. [Rollback Plan](#rollback-plan)

---

## **Project Overview**

**Application**: Xender-In WhatsApp Automation  
**Current State**: JWT tokens stored in Dexie database (`userSessions` table)  
**Target State**: JWT tokens stored using keytar for secure OS-level encryption  
**Architecture Reference**: From `Architecture_WhatsappAutomation.md` - "Keytar – Secure JWT & local secrets storage"

---

## **Migration Objectives**

### **Primary Goals**
- Replace Dexie-based JWT storage with keytar-based secure credential storage
- Implement OS-level encryption for authentication tokens
- Maintain backward compatibility during migration
- Preserve user session data during transition

### **Success Criteria**
- JWT tokens stored securely via keytar
- No data loss during migration
- All authentication flows continue to work
- Enhanced security posture

---

## **Impact Analysis**

### **Security Impact**
- **Before**: JWT tokens stored in plain IndexedDB (Dexie database)
- **After**: JWT tokens encrypted using OS-specific secure storage (Windows DPAPI, macOS Keychain, Linux Secret Service)
- **Security Improvement**: High

### **User Experience Impact**
- **Minor**: Users may need to re-authenticate during migration
- **Benefit**: Enhanced credential security without visible changes
- **Risk**: Platform-specific behavior variations

### **Performance Impact**
- **Negligible**: Keytar operations slightly slower than Dexie but not perceptible to users

---

## **Migration Sequence**

### **Phase 1: Preparation & Setup (Week 1)**
1. Add keytar dependency
2. Create secure credential store class
3. Implement fallback mechanisms

### **Phase 2: Core Implementation (Week 2)**
1. Update AuthService to use keytar
2. Modify UserContextManager integration
3. Update UserProvider handling

### **Phase 3: Migration Logic (Week 3)**
1. Implement migration from Dexie to keytar
2. Add backward compatibility
3. Update session management

### **Phase 4: Testing & Validation (Week 4)**
1. Cross-platform testing
2. User session migration validation
3. Error handling verification

---

## **Affected Files**

### **Core Authentication Files**
1. **`src/lib/services/AuthService.ts`**
   - Store/retrieve JWT tokens
   - Login/logout logic
   - Session validation

2. **`src/lib/security/UserProvider.tsx`**
   - Authentication state management
   - Token access for components
   - Context provider logic

3. **`src/lib/security/UserContextManager.ts`**
   - Session token storage/retrieval
   - Context management
   - Session validation and cleanup

4. **`src/lib/security/LocalSecurityService.ts`**
   - Security validation logic
   - Cross-tenant data access controls
   - Permission management

### **Database Schema Files**
5. **`src/lib/db.ts`**
   - `userSessions` table schema
   - Token storage field modifications
   - Migration hooks

### **Supabase Integration Files**
6. **`src/lib/supabase.ts`**
   - Authentication helpers
   - Token handling

### **Migration-Specific Files (New)**
7. **`src/lib/security/SecureCredentialStore.ts`** *(New)*
   - Keytar wrapper implementation
   - Secure storage interface
   - OS-specific credential management

8. **`src/lib/security/CredentialMigrationManager.ts`** *(New)*
   - Migration logic from Dexie to keytar
   - Backward compatibility handling
   - User session preservation

---

## **Implementation Steps**

### **Step 1: Install Dependency**
```bash
npm install keytar
# If building fails on Windows, install prebuilt binaries:
npm install --build-from-source=keytar keytar
```

### **Step 2: Create Secure Credential Store**
Create `src/lib/security/SecureCredentialStore.ts`:
```typescript
import * as keytar from 'keytar';

const SERVICE_NAME = 'XalesIn-Whatsapp-Automation';

export class SecureCredentialStore {
  private static instance: SecureCredentialStore;
  
  static getInstance(): SecureCredentialStore {
    if (!SecureCredentialStore.instance) {
      SecureCredentialStore.instance = new SecureCredentialStore();
    }
    return SecureCredentialStore.instance;
  }

  async storeToken(accountId: string, token: string): Promise<boolean> {
    try {
      await keytar.setPassword(SERVICE_NAME, accountId, token);
      return true;
    } catch (error) {
      console.error('Failed to store token in keytar:', error);
      return false;
    }
  }

  async getToken(accountId: string): Promise<string | null> {
    try {
      return await keytar.getPassword(SERVICE_NAME, accountId);
    } catch (error) {
      console.error('Failed to retrieve token from keytar:', error);
      return null;
    }
  }

  async deleteToken(accountId: string): Promise<boolean> {
    try {
      await keytar.deletePassword(SERVICE_NAME, accountId);
      return true;
    } catch (error) {
      console.error('Failed to delete token from keytar:', error);
      return false;
    }
  }

  async listStoredAccounts(): Promise<string[]> {
    try {
      const credentials = await keytar.findCredentials(SERVICE_NAME);
      return credentials.map(cred => cred.account);
    } catch (error) {
      console.error('Failed to list stored accounts:', error);
      return [];
    }
  }
}
```

### **Step 3: Create Migration Manager**
Create `src/lib/security/CredentialMigrationManager.ts`:
```typescript
import { SecureCredentialStore } from './SecureCredentialStore';
import { db } from '../db';

export class CredentialMigrationManager {
  private secureStore: SecureCredentialStore;

  constructor() {
    this.secureStore = SecureCredentialStore.getInstance();
  }

  /**
   * Migrate existing tokens from Dexie to keytar
   * Run this during application startup for existing users
   */
  async migrateToKeytar(): Promise<boolean> {
    try {
      // Get all sessions from Dexie database
      const userSessions = await db.userSessions.toArray();
      
      for (const session of userSessions) {
        if (session.session_token) {
          // Store token in keytar
          const success = await this.secureStore.storeToken(
            session.master_user_id,
            session.session_token
          );
          
          if (success) {
            // After successful keytar storage, clear from Dexie (except metadata)
            await db.userSessions.update(session.id, {
              session_token: '' // Clear the token, keep other metadata
            });
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Migration to keytar failed:', error);
      return false;
    }
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      const sessionsWithTokens = await db.userSessions
        .where('session_token')
        .notEqual('')
        .count();
      
      return sessionsWithTokens > 0;
    } catch (error) {
      console.error('Error checking migration needs:', error);
      return false;
    }
  }
}
```

### **Step 4: Update AuthService**
Modify `src/lib/services/AuthService.ts`:
```typescript
import { SecureCredentialStore } from '../security/SecureCredentialStore';
import { db } from '../db';

// Modify the AuthService to use keytar for token storage
export class AuthService {
  private secureStore: SecureCredentialStore;
  
  constructor() {
    this.secureStore = SecureCredentialStore.getInstance();
  }

  // Update storeUserSession to use keytar
  async storeUserSession(session: any): Promise<void> {
    // Store metadata in Dexie
    await db.userSessions.add({
      id: session.id,
      master_user_id: session.master_user_id,
      session_token: '', // Don't store token in Dexie anymore
      expires_at: session.expires_at,
      created_at: session.created_at,
      last_active: session.last_active,
      is_active: true,
      _syncStatus: 'pending',
      _lastModified: new Date().toISOString(),
      _version: 1
    });

    // Store actual token in keytar
    await this.secureStore.storeToken(session.master_user_id, session.access_token);
  }

  // Update getUserSession to retrieve from keytar
  async getUserSession(masterUserId: string): Promise<any> {
    // Get session metadata from Dexie
    const session = await db.userSessions.get({ master_user_id: masterUserId, is_active: true });
    
    if (!session) {
      return null;
    }

    // Get actual token from keytar
    const token = await this.secureStore.getToken(masterUserId);
    
    if (!token) {
      return null;
    }

    return {
      ...session,
      access_token: token
    };
  }

  // Update removeUserSession to clear from keytar
  async removeUserSession(masterUserId: string): Promise<void> {
    // Remove from Dexie
    await db.userSessions.where('master_user_id').equals(masterUserId).delete();
    
    // Remove from keytar
    await this.secureStore.deleteToken(masterUserId);
  }
}
```

### **Step 5: Update UserContextManager**
Modify `src/lib/security/UserContextManager.ts` to work with keytar:
```typescript
import { SecureCredentialStore } from './SecureCredentialStore';

export class UserContextManager {
  private secureStore: SecureCredentialStore;
  
  constructor() {
    this.secureStore = SecureCredentialStore.getInstance();
  }

  // Update session token management to use keytar
  async setSessionToken(userId: string, token: string): Promise<void> {
    const success = await this.secureStore.storeToken(userId, token);
    if (!success) {
      throw new Error('Failed to store session token securely');
    }
  }

  async getSessionToken(userId: string): Promise<string | null> {
    return await this.secureStore.getToken(userId);
  }

  async clearSessionToken(userId: string): Promise<void> {
    await this.secureStore.deleteToken(userId);
  }
}
```

### **Step 6: Update UserProvider**
Modify `src/lib/security/UserProvider.tsx` to integrate with keytar:
```typescript
import { SecureCredentialStore } from './SecureCredentialStore';
import { CredentialMigrationManager } from './CredentialMigrationManager';

// Add migration check during initialization
const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      // Run migration if needed
      const migrationManager = new CredentialMigrationManager();
      const needsMigration = await migrationManager.needsMigration();
      
      if (needsMigration) {
        await migrationManager.migrateToKeytar();
      }

      // Continue with regular initialization
      // ... existing initialization code
    };

    initialize();
  }, []);

  // ... rest of component
};
```

### **Step 7: Update Database Schema**
Modify `src/lib/db.ts` to handle token field appropriately:
```typescript
// Update the LocalUserSession interface to indicate token is stored elsewhere
export interface LocalUserSession {
  id: string;
  master_user_id: string;
  session_token: string; // Now empty string, token stored in keytar
  expires_at: string;
  created_at: string;
  last_active: string;
  is_active: boolean;
  ip_address?: string;
  user_agent?: string;
  _syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  _lastModified: string;
  _version: number;
  _deleted?: boolean;
}
```

---

## **Testing Strategy**

### **Unit Tests**
1. **`SecureCredentialStore`**: Test all CRUD operations with keytar
2. **`CredentialMigrationManager`**: Test migration from Dexie to keytar
3. **AuthService**: Test token storage/retrieval with keytar
4. **UserContextManager**: Test session token management

### **Integration Tests**
1. **Complete authentication flow**: Login → Token storage → Session retrieval → Logout
2. **Migration process**: Test migration for existing users
3. **Error handling**: Test fallback when keytar fails

### **Cross-Platform Tests**
1. **Windows**: Verify Windows DPAPI integration
2. **macOS**: Verify Keychain integration  
3. **Linux**: Verify Secret Service integration

---

## **Risk Mitigation**

### **Risk: Keytar Installation Issues**
**Mitigation**: 
- Provide fallback to Dexie storage if keytar fails
- Include prebuilt binaries in build process
- Document installation troubleshooting

### **Risk: Platform-Specific Behavior**
**Mitigation**:
- Comprehensive cross-platform testing
- Clear error messages for users
- Fallback mechanism for keytar failures

### **Risk: User Session Loss**
**Mitigation**:
- Maintain backward compatibility during transition
- Thorough migration testing
- Backup mechanisms for session data

---

## **Rollback Plan**

### **Emergency Rollback Steps**
1. **Revert keytar dependency**: Remove keytar from package.json
2. **Restore Dexie storage**: Revert AuthService and UserContextManager to Dexie storage
3. **Revert database changes**: Roll back database schema modifications
4. **Deploy patched version**: Revert to pre-migration codebase

### **Data Recovery**
- Tokens stored in keytar can be accessed via keytar API if rollback is needed
- Dexie session metadata preserved during migration for recovery

---

## **Timeline & Milestones**

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Setup & Foundation | Keytar dependency, SecureCredentialStore |
| 2 | Core Implementation | Updated AuthService, UserContextManager |
| 3 | Migration Logic | CredentialMigrationManager, UserProvider updates |
| 4 | Testing & Validation | Cross-platform testing, error handling |

---

## **Post-Migration Considerations**

### **Security Hardening**
- Regular keytar security updates
- Monitor for platform-specific security advisories
- Audit credential access patterns

### **User Communication**
- Inform users about enhanced security
- Provide support for platform-specific issues
- Document any new permission requirements

### **Monitoring**
- Track keytar operation failures
- Monitor cross-platform compatibility
- Verify successful migration completion

---

**Document Created**: November 30, 2025  
**Status**: Ready for Implementation  
**Next Step**: Execute Phase 1 - Dependency Installation and Core Implementation