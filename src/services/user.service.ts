// src/services/user.service.ts
import { supabase } from '../db/index.ts';
import logger from "../utils/logger.ts";
import { WhatsAppServiceError } from "../middleware/error-handler.ts";

export interface UserSession {
  phoneNumber: string;
  createdAt: number;
  lastActivity: number;
  userType: 'seller' | 'buyer' | null;
  currentFlow: string | null;
  userData: Record<string, any>;
  preferences: Record<string, unknown>;
  community?: string;
  communityVoucher?: string;
  shopId?: string; // Added for shop association
}

export interface User {
  id?: string;
  phone: string; // Changed from phoneNumber to match Supabase schema
  name?: string;
  email?: string;
  user_type: 'seller' | 'buyer' | null; // Changed to snake_case for Supabase
  user_data: Record<string, any>; // Stores session userData
  community: string | null;
  voucher_balance: number;
  current_flow: string | null;
  shop_id?: string | null; // Added for shop association
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  phone: string;
  name?: string;
  email?: string;
  user_type: 'seller' | 'buyer';
  community: string;
  user_data?: Record<string, any>;
  voucher_balance?: number;
  current_flow?: string;
}

export interface IUserSessionService {
  getSession(phoneNumber: string): Promise<UserSession | null>;
  createSession(phoneNumber: string): Promise<UserSession>;
  updateSession(phoneNumber: string, updates: Partial<UserSession>): Promise<UserSession | null>;
  deleteSession(phoneNumber: string): Promise<boolean>;
  cleanExpiredSessions(): Promise<number>;
  getActiveSessionCount(): Promise<number>;
  syncSessionWithDatabase(phoneNumber: string): Promise<void>;
}

export interface IUserService {
  createUser(userData: CreateUserData): Promise<User>;
  getUserByPhone(phoneNumber: string): Promise<User | null>;
  updateUser(phoneNumber: string, updates: Partial<User>): Promise<User | null>;
  deleteUser(phoneNumber: string): Promise<boolean>;
  getUserWithShop(phoneNumber: string): Promise<User & { shop?: any } | null>;
  updateUserShopStatus(phoneNumber: string, shopId: string): Promise<void>;
}

/**
 * Enhanced User Session Service with Supabase synchronization
 */
export class UserSessionService implements IUserSessionService {
  private readonly sessions: Map<string, UserSession>;
  private readonly sessionTimeout: number;

  constructor(sessionTimeoutMs: number = 30 * 60 * 1000) {
    // 30 minutes default
    this.sessions = new Map();
    this.sessionTimeout = sessionTimeoutMs;

    // Start cleanup interval
    this.startCleanupInterval();
  }

  async getSession(phoneNumber: string): Promise<UserSession | null> {
    assertValidPhoneNumber(phoneNumber);
    
    let session = this.sessions.get(phoneNumber);

    if (session) {
      const now = Date.now();
      
      // Check if session is expired
      if (now - session.lastActivity > this.sessionTimeout) {
        this.sessions.delete(phoneNumber);
        logger.info(`[UserSession] Expired session removed for ${phoneNumber}`);
        return null;
      }
      
      // Update last activity
      session.lastActivity = now;
      this.sessions.set(phoneNumber, session);
      return session;
    }
    
    // Try to restore session from database
    try {
      const dbUser = await userService.getUserByPhone(phoneNumber);
      if (dbUser) {
        session = this.createSessionFromUser(dbUser);
        this.sessions.set(phoneNumber, session);
        logger.info(`[UserSession] Session restored from database for ${phoneNumber}`);
        return session;
      }
    } catch (error) {
      logger.error({ error }, `[UserSession] Error restoring session from database for ${phoneNumber}`);
    }
    
    return null;
  }

  async createSession(phoneNumber: string): Promise<UserSession> {
    assertValidPhoneNumber(phoneNumber);
    
    const session: UserSession = {
      phoneNumber,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      userType: null,
      currentFlow: 'main_menu',
      userData: {},
      preferences: {}
    };
    
    this.sessions.set(phoneNumber, session);
    logger.info(`[UserSession] New session created for ${phoneNumber}`);
    
    return session;
  }

  async updateSession(phoneNumber: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    assertValidPhoneNumber(phoneNumber);
    
    const session = await this.getSession(phoneNumber);
    if (session) {
      // Merge updates, but protect certain fields
      const { phoneNumber: _, createdAt: __, ...safeUpdates } = updates;
      
      Object.assign(session, safeUpdates);
      session.lastActivity = Date.now();
      
      this.sessions.set(phoneNumber, session);
      logger.debug(`[UserSession] Session updated for ${phoneNumber}`);
      
      // Sync critical session data to database
      await this.syncSessionWithDatabase(phoneNumber);
      
      return session;
    }
    
    logger.warn(`[UserSession] Attempted to update non-existent session: ${phoneNumber}`);
    return null;
  }

  async deleteSession(phoneNumber: string): Promise<boolean> {
    assertValidPhoneNumber(phoneNumber);
    
    const deleted = this.sessions.delete(phoneNumber);
    if (deleted) {
      logger.info(`[UserSession] Session deleted for ${phoneNumber}`);
    }
    
    return deleted;
  }

  async cleanExpiredSessions(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [phoneNumber, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTimeout) {
        // Sync session to database before cleanup
        try {
          await this.syncSessionWithDatabase(phoneNumber);
        } catch (error) {
          logger.error({ error }, `[UserSession] Error syncing session during cleanup: ${phoneNumber}`);
        }
        
        this.sessions.delete(phoneNumber);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`[UserSession] Cleaned ${cleaned} expired sessions`);
    }
    
    return cleaned;
  }

  async getActiveSessionCount(): Promise<number> {
    return this.sessions.size;
  }

  /**
   * Sync session data with Supabase database
   */
  async syncSessionWithDatabase(phoneNumber: string): Promise<void> {
    try {
      const session = this.sessions.get(phoneNumber);
      if (!session) return;

      const updateData = {
        user_data: session.userData,
        current_flow: session.currentFlow,
        user_type: session.userType,
        community: session.community,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('phone', phoneNumber);

      if (error && error.code !== 'PGRST116') { // Ignore if user doesn't exist
        logger.error({ error }, `[UserSession] Error syncing session to database: ${phoneNumber}`);
      }
    } catch (error) {
      logger.error({ error }, `[UserSession] Error syncing session for ${phoneNumber}`);
    }
  }

  /**
   * Create session from database user record
   */
  private createSessionFromUser(dbUser: User): UserSession {
    return {
      phoneNumber: dbUser.phone,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      userType: dbUser.user_type,
      currentFlow: dbUser.current_flow || 'main_menu',
      userData: dbUser.user_data || {},
      preferences: {},
      community: dbUser.community || undefined,
      communityVoucher: this.getCommunityVoucher(dbUser.community),
      shopId: dbUser.shop_id || undefined
    };
  }

  /**
   * Get community voucher name
   */
  private getCommunityVoucher(community: string | null): string | undefined {
    const communityVouchers: Record<string, string> = {
      'BAMEKA': 'MUNKAP',
      'BATOUFAM': 'MBIP TSWEFAP',
      'FONDJOMEKWET': 'MBAM'
    };
    return community ? communityVouchers[community] : undefined;
  }

  /**
   * Get all active sessions (for debugging/monitoring)
   */
  async getActiveSessions(): Promise<UserSession[]> {
    await this.cleanExpiredSessions(); // Clean before returning
    return Array.from(this.sessions.values());
  }

  private startCleanupInterval(): void {
    // Clean expired sessions every 5 minutes
    setInterval(() => {
      this.cleanExpiredSessions().catch(err => {
        logger.error('[UserSession] Error during cleanup:', err);
      });
    }, 5 * 60 * 1000);
  }
}

/**
 * Enhanced User Service with Supabase integration and shop support
 */
export class UserService implements IUserService {
  
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      assertValidPhoneNumber(userData.phone);
      
      // Check if user already exists
      const existingUser = await this.getUserByPhone(userData.phone);
      if (existingUser) {
        throw new WhatsAppServiceError(`User with phone ${userData.phone} already exists`);
      }

      const newUser = {
        phone: userData.phone,
        name: userData.name,
        email: userData.email,
        user_type: userData.user_type,
        community: userData.community,
        user_data: userData.user_data || {},
        voucher_balance: userData.voucher_balance || 100, // Default voucher balance
        current_flow: userData.current_flow || 'main_menu',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('users')
        .insert([newUser])
        .select()
        .single();

      if (error) {
        logger.error({ error }, '[UserService] Error creating user in Supabase');
        throw new WhatsAppServiceError('Failed to create user', { cause: error });
      }
      
      logger.info(`[UserService] User created: ${data.phone} (${data.user_type})`);
      return data;
    } catch (error) {
      logger.error({ error }, '[UserService] Error creating user');
      throw error instanceof WhatsAppServiceError 
        ? error 
        : new WhatsAppServiceError('Failed to create user', { cause: error });
    }
  }

  async getUserByPhone(phoneNumber: string): Promise<User | null> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error({ error }, '[UserService] Error fetching user from Supabase');
        throw new WhatsAppServiceError('Failed to fetch user', { cause: error });
      }

      return data || null;
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching user');
      throw new WhatsAppServiceError('Failed to fetch user', { cause: error });
    }
  }

  async updateUser(phoneNumber: string, updates: Partial<User>): Promise<User | null> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      // Protect certain fields from being updated
      const { id: _, phone: __, created_at: ___, ...safeUpdates } = updates;
      
      const updateData = {
        ...safeUpdates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('phone', phoneNumber)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          logger.warn(`[UserService] Attempted to update non-existent user: ${phoneNumber}`);
          return null;
        }
        logger.error({ error }, '[UserService] Error updating user in Supabase');
        throw new WhatsAppServiceError('Failed to update user', { cause: error });
      }
      
      logger.info(`[UserService] User updated: ${phoneNumber}`);
      return data;
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error updating user');
      throw new WhatsAppServiceError('Failed to update user', { cause: error });
    }
  }

  async deleteUser(phoneNumber: string): Promise<boolean> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('phone', phoneNumber);

      if (error) {
        logger.error({ error }, '[UserService] Error deleting user from Supabase');
        throw new WhatsAppServiceError('Failed to delete user', { cause: error });
      }
      
      logger.info(`[UserService] User deleted: ${phoneNumber}`);
      return true;
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error deleting user');
      throw new WhatsAppServiceError('Failed to delete user', { cause: error });
    }
  }

  /**
   * Get user with their shop information
   */
  async getUserWithShop(phoneNumber: string): Promise<User & { shop?: any } | null> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          shop:shops!shop_id (
            id,
            name,
            description,
            category,
            status,
            settings,
            created_at
          )
        `)
        .eq('phone', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error({ error }, '[UserService] Error fetching user with shop');
        throw new WhatsAppServiceError('Failed to fetch user with shop', { cause: error });
      }

      return data || null;
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching user with shop');
      throw new WhatsAppServiceError('Failed to fetch user with shop', { cause: error });
    }
  }

  /**
   * Update user's shop status when they create a shop
   */
  async updateUserShopStatus(phoneNumber: string, shopId: string): Promise<void> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const { error } = await supabase
        .from('users')
        .update({
          user_type: 'seller',
          shop_id: shopId,
          updated_at: new Date().toISOString()
        })
        .eq('phone', phoneNumber);

      if (error) {
        logger.error({ error }, '[UserService] Error updating user shop status');
        throw new WhatsAppServiceError('Failed to update user shop status', { cause: error });
      }

      logger.info(`[UserService] User shop status updated: ${phoneNumber} -> shop ${shopId}`);
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error updating user shop status');
      throw new WhatsAppServiceError('Failed to update user shop status', { cause: error });
    }
  }

  /**
   * Get all users (for admin/debugging purposes)
   */
  async getAllUsers(): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, '[UserService] Error fetching all users');
        throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
      }

      return data || [];
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching all users');
      throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
    }
  }

  /**
   * Get users by type
   */
  async getUsersByType(userType: 'seller' | 'buyer'): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', userType)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, '[UserService] Error fetching users by type');
        throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
      }

      return data || [];
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching users by type');
      throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
    }
  }

  /**
   * Get users by community
   */
  async getUsersByCommunity(community: string): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('community', community)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, '[UserService] Error fetching users by community');
        throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
      }

      return data || [];
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching users by community');
      throw new WhatsAppServiceError('Failed to fetch users', { cause: error });
    }
  }

  /**
   * Get sellers with their shops in a community
   */
  async getSellersWithShopsInCommunity(community: string): Promise<(User & { shop: any })[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          shop:shops!shop_id (
            id,
            name,
            description,
            category,
            status,
            settings,
            created_at
          )
        `)
        .eq('community', community)
        .eq('user_type', 'seller')
        .eq('is_active', true)
        .not('shop_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, '[UserService] Error fetching sellers with shops');
        throw new WhatsAppServiceError('Failed to fetch sellers with shops', { cause: error });
      }

      return data || [];
    } catch (error) {
      if (error instanceof WhatsAppServiceError) throw error;
      logger.error({ error }, '[UserService] Error fetching sellers with shops');
      throw new WhatsAppServiceError('Failed to fetch sellers with shops', { cause: error });
    }
  }

  /**
   * Get user statistics
   */
 async getUserStats(): Promise<{ 
  total: number; 
  sellers: number; 
  buyers: number; 
  active: number;
  byCommunity: Record<string, number>; // Fixed: removed invisible character
}> {
  try {
    const { data: allUsers, error } = await supabase
      .from('users')
      .select('user_type, is_active, community');

    if (error) {
      logger.error({ error }, '[UserService] Error fetching user stats');
      throw new WhatsAppServiceError('Failed to fetch user stats', { cause: error });
    }

    const users = allUsers || [];
    const communityStats: Record<string, number> = {};

    users.forEach(user => {
      if (user.community) {
        communityStats[user.community] = (communityStats[user.community] || 0) + 1;
      }
    });

    return {
      total: users.length,
      sellers: users.filter(u => u.user_type === 'seller').length,
      buyers: users.filter(u => u.user_type === 'buyer').length,
      active: users.filter(u => u.is_active).length,
      byCommunity: communityStats // Fixed: corrected property name
    };
  } catch (error) {
    if (error instanceof WhatsAppServiceError) throw error;
    logger.error({ error }, '[UserService] Error fetching user stats');
    throw new WhatsAppServiceError('Failed to fetch user stats', { cause: error });
  }
}

  /**
   * Update user voucher balance
   */
  async updateVoucherBalance(phoneNumber: string, amount: number, operation: 'add' | 'subtract' | 'set'): Promise<User | null> {
    try {
      const user = await this.getUserByPhone(phoneNumber);
      if (!user) return null;

      let newBalance = user.voucher_balance;
      
      switch (operation) {
        case 'add':
          newBalance += amount;
          break;
        case 'subtract':
          newBalance = Math.max(0, newBalance - amount);
          break;
        case 'set':
          newBalance = Math.max(0, amount);
          break;
      }

      return await this.updateUser(phoneNumber, { voucher_balance: newBalance });
    } catch (error) {
      logger.error({ error }, '[UserService] Error updating voucher balance');
      throw new WhatsAppServiceError('Failed to update voucher balance', { cause: error });
    }
  }
}

/* ------------------------------- helpers ------------------------------- */

function assertValidPhoneNumber(phoneNumber: unknown): asserts phoneNumber is string {
  if (typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
    throw new WhatsAppServiceError('Invalid phone number: must be a non-empty string');
  }
  
  // Basic validation - you might want to use the same normalization as in whatsapp.service.ts
  const cleaned = phoneNumber.trim();
  if (cleaned.length < 7) {
    throw new WhatsAppServiceError(`Invalid phone number format: "${phoneNumber}"`);
  }
}

// Singleton instances for easy import
export const userSessionService = new UserSessionService();
export const userService = new UserService();