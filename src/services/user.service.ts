// src/services/user.service.ts
import logger from "../utils/logger";
import { WhatsAppServiceError } from "../middleware/error-handler";

export interface UserSession {
  phoneNumber: string;
  createdAt: number;
  lastActivity: number;
  userType: 'seller' | 'buyer' | null;
  currentFlow: string | null;
  userData: Record<string, unknown>;
  preferences: Record<string, unknown>;
  community?: string;
  communityVoucher?: string;
}

export interface User {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  userType: 'seller' | 'buyer';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown; // For additional user properties
}

export interface CreateUserData {
  phoneNumber: string;
  name?: string;
  email?: string;
  userType: 'seller' | 'buyer';
  [key: string]: unknown;
}

export interface IUserSessionService {
  getSession(phoneNumber: string): Promise<UserSession | null>;
  createSession(phoneNumber: string): Promise<UserSession>;
  updateSession(phoneNumber: string, updates: Partial<UserSession>): Promise<UserSession | null>;
  deleteSession(phoneNumber: string): Promise<boolean>;
  cleanExpiredSessions(): Promise<number>;
  getActiveSessionCount(): Promise<number>;
}

export interface IUserService {
  createUser(userData: CreateUserData): Promise<User>;
  getUserByPhone(phoneNumber: string): Promise<User | null>;
  updateUser(phoneNumber: string, updates: Partial<User>): Promise<User | null>;
  deleteUser(phoneNumber: string): Promise<boolean>;
}

/**
 * User session management service with in-memory storage.
 * This will be replaced with a persistent storage solution later.
 */
export class UserSessionService implements IUserSessionService {
  private readonly sessions: Map<string, UserSession>;
  private readonly sessionTimeout: number;

  constructor(sessionTimeoutMs: number = 30 * 60 * 1000) { // 30 minutes default
    this.sessions = new Map();
    this.sessionTimeout = sessionTimeoutMs;
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  async getSession(phoneNumber: string): Promise<UserSession | null> {
    assertValidPhoneNumber(phoneNumber);
    
    const session = this.sessions.get(phoneNumber);
    
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
    
    return null;
  }

  async createSession(phoneNumber: string): Promise<UserSession> {
    assertValidPhoneNumber(phoneNumber);
    
    const session: UserSession = {
      phoneNumber,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      userType: null,
      currentFlow: null,
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
 * User management service with in-memory storage.
 * This will be replaced with Supabase integration later.
 */
export class UserService implements IUserService {
  private readonly users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async createUser(userData: CreateUserData): Promise<User> {
    try {
      assertValidPhoneNumber(userData.phoneNumber);
      
      // Check if user already exists
      const existingUser = await this.getUserByPhone(userData.phoneNumber);
      if (existingUser) {
        throw new WhatsAppServiceError(`User with phone ${userData.phoneNumber} already exists`);
      }

      const user: User = {
        id: this.generateUserId(),
        ...userData,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // TODO: Replace with Supabase insert
      this.users.set(user.phoneNumber, user);
      
      logger.info(`[UserService] User created: ${user.phoneNumber} (${user.userType})`);
      return user;
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
      
      // TODO: Replace with Supabase query
      return this.users.get(phoneNumber) || null;
    } catch (error) {
      logger.error({ error }, '[UserService] Error fetching user');
      throw new WhatsAppServiceError('Failed to fetch user', { cause: error });
    }
  }

  async updateUser(phoneNumber: string, updates: Partial<User>): Promise<User | null> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const user = this.users.get(phoneNumber);
      if (user) {
        // Protect certain fields from being updated
        const { id: _, phoneNumber: __, createdAt: ___, ...safeUpdates } = updates;
        
        Object.assign(user, safeUpdates);
        user.updatedAt = new Date().toISOString();
        
        this.users.set(phoneNumber, user);
        logger.info(`[UserService] User updated: ${phoneNumber}`);
        return user;
      }
      
      logger.warn(`[UserService] Attempted to update non-existent user: ${phoneNumber}`);
      return null;
    } catch (error) {
      logger.error({ error }, '[UserService] Error updating user');
      throw new WhatsAppServiceError('Failed to update user', { cause: error });
    }
  }

  async deleteUser(phoneNumber: string): Promise<boolean> {
    try {
      assertValidPhoneNumber(phoneNumber);
      
      const deleted = this.users.delete(phoneNumber);
      if (deleted) {
        logger.info(`[UserService] User deleted: ${phoneNumber}`);
      }
      
      return deleted;
    } catch (error) {
      logger.error({ error }, '[UserService] Error deleting user');
      throw new WhatsAppServiceError('Failed to delete user', { cause: error });
    }
  }

  /**
   * Get all users (for admin/debugging purposes)
   */
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  /**
   * Get users by type
   */
  async getUsersByType(userType: 'seller' | 'buyer'): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.userType === userType);
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{ total: number; sellers: number; buyers: number; active: number }> {
    const users = Array.from(this.users.values());
    return {
      total: users.length,
      sellers: users.filter(u => u.userType === 'seller').length,
      buyers: users.filter(u => u.userType === 'buyer').length,
      active: users.filter(u => u.isActive).length
    };
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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