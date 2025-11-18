import { User, AuthResponse } from './types';
import { supabase, rpcHelpers, authHelpers, handleDatabaseError } from '../supabase';
import { userContextManager } from '../security/UserContextManager';
import { db } from '../db';

export class AuthService {
  // Login with Supabase authentication
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      console.log('Starting login process for:', email);
      
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (isOnline) {
        // Online mode: perform full authentication with Supabase
        const { user, session } = await authHelpers.signInWithEmail(email, password);
        
        if (!user) {
          throw new Error('No user returned from authentication');
        }

        console.log('User authenticated successfully:', user.id);

        // Get or create user profile with retry logic
        const profile = await this.getOrCreateProfile(user);
        
        // Get user quota with fallback
        let quota;
        try {
          const quotaData = await rpcHelpers.getUserQuota(user.id);
          quota = quotaData[0];
        } catch (error) {
          console.warn('Failed to get existing quota, creating default:', error);
          quota = null;
        }
        
        if (!quota) {
          console.log('No quota found, creating default quota');
          quota = await this.createDefaultQuota(user.id);
        }

        const userData: User = {
          id: user.id,
          email: user.email!,
          name: profile?.name || user.email!.split('@')[0],
          role: profile?.role || 'owner',
          master_user_id: profile?.master_user_id || user.id,
          created_at: user.created_at
        };

        console.log('Login process completed successfully');

        // Set user context for data isolation
        await userContextManager.setCurrentUser(userData, session?.access_token);

        return {
          user: userData,
          token: session?.access_token || '',
          quota: quota
        };
      } else {
        // Offline mode: try to use cached credentials or return error
        const cachedUser = await userContextManager.getCurrentUser();
        if (cachedUser) {
          // Return cached user data if available
          console.log('Using cached user data for offline login');
          
          // Get cached quota if available
          let cachedQuota = null;
          try {
            // In offline mode, get quota from local database if available
            const { data: { user: localUser }, error } = await supabase.auth.getUser();
            if (localUser && localUser.id) {
              const localQuota = await db.quotas.get(localUser.id);
              if (localQuota) {
                cachedQuota = {
                  ...localQuota,
                  remaining: localQuota.messages_limit - localQuota.messages_used
                };
              }
            }
          } catch (error) {
            console.warn('Could not retrieve cached quota:', error);
          }

          return {
            user: cachedUser,
            token: '',
            quota: cachedQuota
          };
        } else {
          throw new Error('No cached credentials available. Cannot login in offline mode.');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(`Login failed: ${handleDatabaseError(error)}`);
    }
 }

  /**
   * Check online status with timeout and fallback
   */
  private async checkOnlineStatus(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300); // 3 second timeout
      
      const response = await fetch('/api/ping', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.log('Network check failed, assuming offline mode:', error);
      return false;
    }
  }

  // Forgot Password - Send reset email
  async forgotPassword(email: string): Promise<void> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (!isOnline) {
        throw new Error('Password reset requires an active internet connection');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      // Send password reset email via Supabase with explicit redirect URL
      const redirectUrl = `${window.location.origin}/reset-password`;
      await authHelpers.resetPasswordForEmail(email, redirectUrl);
      
      console.log('Password reset email sent to:', email);
    } catch (error) {
      console.error('Forgot password error:', error);
      throw error;
    }
  }

  // Reset Password - Update with new password
  async resetPassword(newPassword: string): Promise<void> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (!isOnline) {
        throw new Error('Password reset requires an active internet connection');
      }

      // Validate password strength
      if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Update password via Supabase
      await authHelpers.updatePassword(newPassword);
      
      console.log('Password updated successfully');
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }

  // Verify OTP token (for password reset confirmation)
  async verifyOtp(email: string, token: string, type: 'recovery' | 'signup' | 'email' = 'recovery'): Promise<boolean> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (!isOnline) {
        throw new Error('OTP verification requires an active internet connection');
      }

      await authHelpers.verifyOtp(email, token, type);
      return true;
    } catch (error) {
      console.error('OTP verification error:', error);
      return false;
    }
  }

  // Register new user
  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();

      if (!isOnline) {
        throw new Error('Registration requires an active internet connection');
      }

      // Online mode: perform auth signup only - database triggers handle profile/quota creation
      const { user, session } = await authHelpers.signUpWithEmail(email, password, {
        name: name || email.split('@')[0]
      });

      if (!user) {
        throw new Error('No user returned from registration');
      }

      // Wait a moment for database triggers to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the profile and quota created by database triggers
      const profile = await this.getOrCreateProfile(user);
      let quota;
      try {
        const quotaData = await rpcHelpers.getUserQuota(user.id);
        quota = quotaData[0];
      } catch (error) {
        console.warn('Failed to get quota created by trigger, creating default:', error);
        quota = await this.createDefaultQuota(user.id);
      }

      const userData: User = {
        id: user.id,
        email: user.email!,
        name: profile?.name || name || user.email!.split('@')[0],
        role: profile?.role || 'owner',
        master_user_id: profile?.master_user_id || user.id,
        created_at: user.created_at
      };

      // Set user context for data isolation
      await userContextManager.setCurrentUser(userData, session?.access_token);

      return {
        user: userData,
        token: session?.access_token || '',
        quota: quota
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  // Validate token with Supabase
  async validateToken(token: string): Promise<boolean> {
    try {
      if (!token) return false;
      
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (isOnline) {
        // Online mode: validate with Supabase
        const { session } = await authHelpers.getSession();
        return !!session?.user;
      } else {
        // Offline mode: check if we have a cached user
        const cachedUser = await userContextManager.getCurrentUser();
        return !!cachedUser;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  // Logout from Supabase and clear user context
 async logout(): Promise<void> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (isOnline) {
        // Online mode: perform full logout with Supabase
        await authHelpers.signOut();
      } else {
        // Offline mode: just clear local context
        console.log('Offline mode: clearing local user context only');
      }
      
      // Clear user context for security in both online and offline modes
      await userContextManager.clearCurrentUser();
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user context even if Supabase logout fails
      await userContextManager.clearCurrentUser();
      throw error;
    }
  }

  // Get current user from UserContextManager (with Supabase fallback)
  async getCurrentUser(): Promise<User | null> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();

      // First try to get from UserContextManager (more secure)
      const contextUser = await userContextManager.getCurrentUser();
      if (contextUser) {
        // If online, try to refresh user data from server
        if (isOnline) {
          try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (!error && user) {
              const profile = await this.getOrCreateProfile(user);

              const userData: User = {
                id: user.id,
                email: user.email!,
                name: profile?.name || user.email!.split('@')[0],
                role: profile?.role || 'owner',
                master_user_id: profile?.master_user_id || user.id,
                created_at: user.created_at
              };

              // Update context with fresh data
              await userContextManager.setCurrentUser(userData);

              return userData;
            }
          } catch (refreshError) {
            console.warn('Could not refresh user data, using cached data:', refreshError);
            // Don't clear context on refresh failure - keep cached data
          }
        }

        return contextUser;
      }

      if (isOnline) {
        // Fallback to Supabase if context is not set
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;

        const profile = await this.getOrCreateProfile(user);

        const userData: User = {
          id: user.id,
          email: user.email!,
          name: profile?.name || user.email!.split('@')[0],
          role: profile?.role || 'owner',
          master_user_id: profile?.master_user_id || user.id,
          created_at: user.created_at
        };

        // Set context for future use
        await userContextManager.setCurrentUser(userData);

        return userData;
      } else {
        // Offline mode: return null if no cached user
        return null;
      }
    } catch (error) {
      console.error('Get current user error:', error);
      // Don't clear context on error - return cached user if available
      try {
        return await userContextManager.getCurrentUser();
      } catch (contextError) {
        return null;
      }
    }
  }

  // Subscribe to auth state changes
 onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (session?.user) {
        // If online, try to get fresh user data, otherwise use cached
        let user: User | null = null;
        if (isOnline) {
          user = await this.getCurrentUser();
        } else {
          // In offline mode, try to get cached user
          user = await userContextManager.getCurrentUser();
        }
        callback(user);
      } else {
        // Clear user context on logout
        await userContextManager.clearCurrentUser();
        callback(null);
      }
    });
  }

  // Enhanced user session management methods

  /**
   * Get current user ID (convenience method)
   */
  async getCurrentUserId(): Promise<string | null> {
    const user = await this.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Get current master user ID (convenience method)
   */
  async getCurrentMasterUserId(): Promise<string | null> {
    return await userContextManager.getCurrentMasterUserId();
  }

  /**
   * Set current user context (for session management)
   */
  async setCurrentUser(user: User, sessionToken?: string): Promise<void> {
    await userContextManager.setCurrentUser(user, sessionToken);
  }

  /**
   * Clear current user context (for logout/session cleanup)
   */
  async clearCurrentUser(): Promise<void> {
    await userContextManager.clearCurrentUser();
  }

  /**
   * Validate current user session
   */
  async validateCurrentSession(): Promise<boolean> {
    return !!(await userContextManager.getCurrentUser());
  }

  /**
   * Get user session status
   */
  async getSessionStatus() {
    const user = await userContextManager.getCurrentUser();
    const masterUserId = await userContextManager.getCurrentMasterUserId();

    return {
      isAuthenticated: !!user,
      user: user,
      masterUserId: masterUserId,
      sessionValid: !!user
    };
  }

  /**
   * Force session refresh
   */
  async refreshSession(): Promise<User | null> {
    try {
      // Check online status
      const isOnline = await this.checkOnlineStatus();
      
      if (isOnline) {
        // Online mode: re-validate with Supabase
        const { data: { user: supabaseUser }, error } = await supabase.auth.getUser();
        if (error || !supabaseUser) {
          await this.clearCurrentUser();
          return null;
        }

        // Get fresh profile data
        const profile = await this.getOrCreateProfile(supabaseUser);

        const userData: User = {
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: profile?.name || supabaseUser.email!.split('@')[0],
          role: profile?.role || 'owner',
          master_user_id: profile?.master_user_id || supabaseUser.id,
          created_at: supabaseUser.created_at
        };

        // Update context
        await userContextManager.setCurrentUser(userData);

        return userData;
      } else {
        // Offline mode: return cached user if available
        console.log('Offline mode: returning cached user data');
        const cachedUser = await userContextManager.getCurrentUser();
        return cachedUser;
      }
    } catch (error) {
      console.error('Session refresh error:', error);
      await this.clearCurrentUser();
      return null;
    }
  }

  // Get or create user profile
  private async getOrCreateProfile(user: any) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        throw error;
      }

      if (data) {
        return data;
      }

      // Create profile if doesn't exist
      console.log('Profile not found, creating new profile for user:', user.id);
      return await this.createProfile({
        id: user.id,
        email: user.email!,
        name: user.user_metadata?.name || user.email!.split('@')[0],
        role: 'owner',
        master_user_id: user.id
      });
    } catch (error) {
      console.error('Get or create profile error:', error);
      throw new Error(`Failed to get or create profile: ${handleDatabaseError(error)}`);
    }
  }

  // Create user profile
  private async createProfile(profileData: {
    id: string;
    email: string;
    name: string;
    role: string;
    master_user_id: string;
  }) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: profileData.id,
          email: profileData.email,
          name: profileData.name,
          role: profileData.role,
          master_user_id: profileData.master_user_id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Create profile error:', error);
      throw error;
    }
  }

  // Create default quota for new user
  // FIXED: Updated field names to match actual Supabase schema
  private async createDefaultQuota(userId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('user_quotas')
        .insert({
          user_id: userId,
          master_user_id: userId,          // FIXED: Added required field
          plan_type: 'basic',
          messages_limit: 100,
          messages_used: 0,
          reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),  // FIXED: Correct field name
          is_active: true                   // FIXED: Added required field
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add computed 'remaining' field for backward compatibility
      return {
        ...data,
        remaining: data.messages_limit - data.messages_used
      };
    } catch (error) {
      console.error('Create default quota error:', error);
      // Return mock quota if database creation fails
      return {
        id: 'default_quota',
        user_id: userId,
        master_user_id: userId,
        plan_type: 'basic',
        messages_limit: 100,
        messages_used: 0,
        remaining: 100,
        reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true
      };
    }
  }
}