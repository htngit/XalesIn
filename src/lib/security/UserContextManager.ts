/**
 * UserContextManager - Local RLS (Row Level Security) Equivalent
 * Provides comprehensive user data isolation and access control
 */

import { User } from '../services/types';
import { db } from '../db';
import { supabase, handleDatabaseError } from '../supabase';
import { nowISO, fromISOString } from '../utils/timestamp';

/**
 * Security event types for audit logging
 */
export type SecurityEventType = 
  | 'user_login'
  | 'user_logout'
  | 'session_created'
  | 'session_expired'
  | 'unauthorized_access_attempt'
  | 'data_access_violation'
  | 'permission_denied'
  | 'session_hijack_attempt'
  | 'user_context_switch'
  | 'security_breach_detected'
  | 'session_validation';

/**
 * User context validation result
 */
export interface UserContextValidation {
  isValid: boolean;
  user?: User;
  masterUserId?: string;
  error?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Security event for audit logging
 */
export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  user_id?: string;
  master_user_id?: string;
  resource?: string;
  action?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
  _syncStatus: 'pending' | 'synced' | 'error';
  _lastModified: string;
  _version: number;
  _deleted?: boolean;
}

/**
 * User session information
 */
export interface UserSessionInfo {
  id: string;
  master_user_id: string;
  session_token: string;
  expires_at: string;
  created_at: string;
  last_active: string;
  ip_address?: string;
  user_agent?: string;
  is_active: boolean;
  _syncStatus: 'pending' | 'synced' | 'error';
  _lastModified: string;
  _version: number;
}

/**
 * UserContextManager - Comprehensive user data isolation and security management
 */
class UserContextManager {
  private currentUser: User | null = null;
  private currentMasterUserId: string | null = null;
  private sessionToken: string | null = null;
  private securityEvents: SecurityEvent[] = [];
  private sessionValidationInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.initializeSecurityManager();
  }

  /**
   * Initialize security manager with session validation
   */
  private initializeSecurityManager() {
    this.startSessionValidation();
    this.setupSecurityEventListeners();
  }

  /**
   * Start automatic session validation
   */
  private startSessionValidation() {
    this.sessionValidationInterval = setInterval(() => {
      this.validateAllActiveSessions();
    }, this.SESSION_VALIDATION_INTERVAL);
  }

  /**
   * Setup security event listeners for monitoring
   */
  private setupSecurityEventListeners() {
    // Listen for authentication state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        await this.handleUserLogout();
      }
    });
  }

  /**
   * Set current user context and validate session
   */
  async setCurrentUser(user: User, sessionToken?: string): Promise<void> {
    try {
      // Validate user context
      const validation = await this.validateUserContext(user);
      if (!validation.isValid) {
        throw new Error(`Invalid user context: ${validation.error}`);
      }

      // Set current user
      this.currentUser = user;
      this.currentMasterUserId = user.master_user_id;
      
      // Store or update session
      if (sessionToken) {
        this.sessionToken = sessionToken;
        await this.createUserSession(user, sessionToken);
      }

      // Log security event
      await this.logSecurityEvent({
        event_type: 'user_login',
        user_id: user.id,
        master_user_id: user.master_user_id,
        severity: 'info',
        details: { 
          login_method: sessionToken ? 'token' : 'password',
          user_role: user.role 
        }
      });

      console.log(`User context established for: ${user.email} (Master: ${user.master_user_id})`);
    } catch (error) {
      console.error('Error setting current user context:', error);
      await this.logSecurityEvent({
        event_type: 'security_breach_detected',
        severity: 'critical',
        details: { 
          error: error instanceof Error ? error.message : String(error),
          attempted_user_id: user.id 
        }
      });
      throw error;
    }
  }

  /**
   * Clear current user context and invalidate session
   */
  async clearCurrentUser(): Promise<void> {
    try {
      // Store user info before clearing for logging
      const userToLog = this.currentUser;

      // Invalidate session in database
      if (this.sessionToken) {
        await this.invalidateUserSession(this.sessionToken);
      }

      // Log logout event if we have user info
      if (userToLog) {
        await this.logSecurityEvent({
          event_type: 'user_logout',
          user_id: userToLog.id,
          master_user_id: userToLog.master_user_id,
          severity: 'info',
          details: { logout_reason: 'manual' }
        });
      }

      // Clear context
      this.currentUser = null;
      this.currentMasterUserId = null;
      this.sessionToken = null;
    } catch (error) {
      console.error('Error clearing user context:', error);
      // Still clear context even if logging fails
      this.currentUser = null;
      this.currentMasterUserId = null;
      this.sessionToken = null;
      throw error;
    }
  }

  /**
   * Get current user with validation
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      // Validate current session
      if (this.currentUser && this.sessionToken) {
        const isValid = await this.validateCurrentSession();
        if (isValid) {
          return this.currentUser;
        } else {
          // Session invalid, clear context
          await this.clearCurrentUser();
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get current master user ID with validation
   */
  async getCurrentMasterUserId(): Promise<string | null> {
    const user = await this.getCurrentUser();
    return user?.master_user_id || null;
  }

  /**
   * Validate user context and data access permissions
   */
  async validateUserContext(user: User): Promise<UserContextValidation> {
    try {
      // Basic validation
      if (!user || !user.id || !user.master_user_id) {
        return {
          isValid: false,
          error: 'Invalid user structure',
          riskLevel: 'high'
        };
      }

      // Validate UUID format
      if (!this.isValidUUID(user.id) || !this.isValidUUID(user.master_user_id)) {
        return {
          isValid: false,
          error: 'Invalid UUID format',
          riskLevel: 'critical'
        };
      }

      // Validate role
      if (!['owner', 'staff'].includes(user.role)) {
        return {
          isValid: false,
          error: 'Invalid user role',
          riskLevel: 'high'
        };
      }

      // Verify user exists in database
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, master_user_id, role, is_active')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        return {
          isValid: false,
          error: 'User not found in database',
          riskLevel: 'critical'
        };
      }

      // Verify account is active
      if (!profile.is_active) {
        return {
          isValid: false,
          error: 'User account is inactive',
          riskLevel: 'high'
        };
      }

      // Verify master_user_id matches
      if (profile.master_user_id !== user.master_user_id) {
        return {
          isValid: false,
          error: 'Master user ID mismatch',
          riskLevel: 'critical'
        };
      }

      return {
        isValid: true,
        user,
        masterUserId: user.master_user_id,
        riskLevel: 'low'
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        riskLevel: 'high'
      };
    }
  }

  /**
   * Enforce data isolation - check if resource belongs to current user
   */
  async enforceDataIsolation(resourceMasterUserId: string, resourceType: string): Promise<boolean> {
    const currentMasterId = await this.getCurrentMasterUserId();
    
    if (!currentMasterId) {
      await this.logSecurityEvent({
        event_type: 'unauthorized_access_attempt',
        severity: 'warning',
        details: { 
          reason: 'no_current_user',
          resource_type: resourceType,
          resource_master_id: resourceMasterUserId 
        }
      });
      return false;
    }

    if (currentMasterId !== resourceMasterUserId) {
      await this.logSecurityEvent({
        event_type: 'data_access_violation',
        severity: 'error',
        user_id: this.currentUser?.id,
        master_user_id: currentMasterId,
        details: { 
          resource_type: resourceType,
          resource_master_id: resourceMasterUserId,
          current_master_id: currentMasterId,
          action: 'cross_tenant_access_attempt'
        }
      });
      return false;
    }

    return true;
  }

  /**
   * Check user permissions for specific actions
   */
  async checkPermission(action: string, resourceType: string): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) {
      await this.logSecurityEvent({
        event_type: 'permission_denied',
        severity: 'warning',
        details: { action, resource_type: resourceType, reason: 'not_authenticated' }
      });
      return false;
    }

    // Owner has all permissions
    if (user.role === 'owner') {
      return true;
    }

    // Staff permissions (can be extended based on requirements)
    const allowedActions = [
      'read_contacts',
      'create_contacts',
      'update_contacts',
      'read_groups',
      'create_groups',
      'update_groups',
      'delete_groups',
      'read_templates',
      'create_templates',
      'update_templates',
      'read_history',
      'read_assets',
      'upload_assets',
      'read_quotas',
      'create_quotas',
      'update_quotas',
      'read_payments',
      'create_payments',
      'update_payments'
    ];

    const isAllowed = allowedActions.includes(action);
    
    if (!isAllowed) {
      await this.logSecurityEvent({
        event_type: 'permission_denied',
        severity: 'warning',
        user_id: user.id,
        master_user_id: user.master_user_id,
        details: { action, resource_type: resourceType, user_role: user.role }
      });
    }

    return isAllowed;
  }

  /**
   * Check if user has permission for specific action
   */
  async canPerformAction(action: string, resourceType: string, resourceMasterUserId?: string): Promise<boolean> {
    // Check basic permission
    const hasPermission = await this.checkPermission(action, resourceType);
    if (!hasPermission) {
      return false;
    }

    // Check data isolation if resource master user ID is provided
    if (resourceMasterUserId) {
      return await this.enforceDataIsolation(resourceMasterUserId, resourceType);
    }

    return true;
  }

  /**
   * Create user session with security tracking
   */
  private async createUserSession(user: User, sessionToken: string): Promise<void> {
    try {
      const sessionInfo: Omit<import('../db').LocalUserSession, 'id'> = {
        master_user_id: user.master_user_id,
        session_token: sessionToken,
        expires_at: nowISO(),
        created_at: nowISO(),
        last_active: nowISO(),
        is_active: true,
        _syncStatus: 'pending',
        _lastModified: nowISO(),
        _version: 1
      };

      await db.userSessions.add({
        id: crypto.randomUUID(),
        ...sessionInfo
      });

      await this.logSecurityEvent({
        event_type: 'session_created',
        user_id: user.id,
        master_user_id: user.master_user_id,
        severity: 'info',
        details: { session_token_prefix: sessionToken.substring(0, 10) + '...' }
      });

    } catch (error) {
      console.error('Error creating user session:', error);
      throw error;
    }
  }

  /**
   * Validate current session
   */
  private async validateCurrentSession(): Promise<boolean> {
    if (!this.sessionToken) {
      return false;
    }

    try {
      const session = await db.userSessions
        .where('session_token')
        .equals(this.sessionToken)
        .and(s => s.is_active)
        .first();

      if (!session) {
        return false;
      }

      // Check if session has expired
      if (fromISOString(session.expires_at) < new Date()) {
        await this.invalidateUserSession(this.sessionToken);
        await this.logSecurityEvent({
          event_type: 'session_expired',
          severity: 'warning',
          details: { session_token_prefix: this.sessionToken.substring(0, 10) + '...' }
        });
        return false;
      }

      // Update last active time
      await db.userSessions.update(session.id, {
        last_active: nowISO(),
        _syncStatus: 'pending',
        _lastModified: nowISO(),
        _version: session._version + 1
      });

      return true;
    } catch (error) {
      console.error('Error validating session:', error);
      return false;
    }
  }

  /**
   * Invalidate user session
   */
  private async invalidateUserSession(sessionToken: string): Promise<void> {
    try {
      await db.userSessions
        .where('session_token')
        .equals(sessionToken)
        .modify({
          is_active: false,
          _syncStatus: 'pending',
          _lastModified: nowISO()
        });
    } catch (error) {
      console.error('Error invalidating session:', error);
    }
  }

  /**
   * Validate all active sessions and cleanup expired ones
   */
  private async validateAllActiveSessions(): Promise<void> {
    try {
      const now = new Date();
      
      // Cleanup expired sessions
      await db.userSessions
        .where('expires_at')
        .below(nowISO())
        .modify({
          is_active: false,
          _syncStatus: 'pending',
          _lastModified: nowISO()
        });

      // Log security event
      await this.logSecurityEvent({
        event_type: 'session_validation',
        severity: 'info',
        details: { validation_type: 'cleanup_expired_sessions' }
      });

    } catch (error) {
      console.error('Error validating sessions:', error);
    }
  }

  /**
   * Handle user logout
   */
  private async handleUserLogout(): Promise<void> {
    if (this.currentUser && this.sessionToken) {
      await this.invalidateUserSession(this.sessionToken);
      await this.logSecurityEvent({
        event_type: 'user_logout',
        user_id: this.currentUser.id,
        master_user_id: this.currentUser.master_user_id,
        severity: 'info',
        details: { logout_reason: 'auth_state_change' }
      });
    }
    this.clearCurrentUser();
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | '_syncStatus' | '_lastModified' | '_version' | '_deleted'>): Promise<void> {
    try {
      const timestamp = nowISO();
      const securityEvent: SecurityEvent = {
        id: crypto.randomUUID(),
        ...event,
        timestamp,
        _syncStatus: 'pending',
        _lastModified: timestamp,
        _version: 1,
        _deleted: false
      };

      await db.activityLogs.add({
        id: securityEvent.id,
        user_id: event.user_id || 'system',
        master_user_id: event.master_user_id || 'system',
        contact_group_id: undefined,
        template_id: undefined,
        template_name: event.event_type,
        total_contacts: 0,
        success_count: 0,
        failed_count: 0,
        status: 'completed',
        delay_range: 0,
        error_message: event.details ? JSON.stringify(event.details) : undefined,
        metadata: event.details,
        created_at: timestamp,
        updated_at: timestamp,
        _syncStatus: securityEvent._syncStatus,
        _lastModified: securityEvent._lastModified,
        _version: securityEvent._version,
        _deleted: false
      });

      this.securityEvents.push(securityEvent);
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Get security audit trail
   */
  async getSecurityAuditTrail(limit: number = 100): Promise<SecurityEvent[]> {
    try {
      const events = await db.activityLogs
        .where('template_name')
        .startsWithAnyOf(['user_login', 'user_logout', 'session_', 'unauthorized_', 'data_access_', 'permission_denied', 'security_'])
        .reverse()
        .limit(limit)
        .toArray();

      return events.map(event => ({
        id: event.id,
        event_type: event.template_name as SecurityEventType,
        user_id: event.user_id,
        master_user_id: event.master_user_id,
        timestamp: event.created_at,
        severity: 'info',
        details: event.metadata,
        _syncStatus: 'synced',
        _lastModified: nowISO(),
        _version: 1,
        _deleted: false
      }));
    } catch (error) {
      console.error('Error getting security audit trail:', error);
      return [];
    }
  }

  /**
   * Utility: Validate UUID format
   */
  private isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof value === 'string' && uuidRegex.test(value);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.sessionValidationInterval) {
      clearInterval(this.sessionValidationInterval);
      this.sessionValidationInterval = null;
    }
    this.clearCurrentUser();
  }
}

// Export singleton instance
export const userContextManager = new UserContextManager();