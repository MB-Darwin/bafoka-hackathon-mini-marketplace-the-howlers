import { supabase } from '../db/index.ts';
import logger from '../utils/logger.ts';
import {ShopServiceError } from '../middleware/error-handler.ts';

export interface Shop {
  id: string;
  name: string;
  description: string;
  owner_phone: string;
  community: string;
  category: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
  settings: {
    delivery_available: boolean;
    pickup_available: boolean;
    operating_hours: {
      open: string;
      close: string;
      days: string[];
    };
    contact_info: {
      whatsapp: string;
      address?: string;
    };
  };
}

export interface CreateShopData {
  name: string;
  description: string;
  owner_phone: string;
  community: string;
  category: string;
  delivery_available?: boolean;
  pickup_available?: boolean;
  operating_hours?: {
    open: string;
    close: string;
    days: string[];
  };
  address?: string;
}

export class ShopService {
  
  /**
   * Create a new shop
   */
  async createShop(shopData: CreateShopData): Promise<Shop> {
    try {
      // Check if user already has a shop
      const existingShop = await this.getShopByOwner(shopData.owner_phone);
      if (existingShop) {
        throw new ShopServiceError('User already has a shop. Only one shop per user is allowed.');
      }

      // Validate shop name uniqueness in community
      const nameExists = await this.isShopNameTaken(shopData.name, shopData.community);
      if (nameExists) {
        throw new ShopServiceError('Shop name is already taken in this community. Please choose a different name.');
      }

      // Prepare shop data
      const newShop = {
        name: shopData.name.trim(),
        description: shopData.description.trim(),
        owner_phone: shopData.owner_phone,
        community: shopData.community,
        category: shopData.category,
        status: 'active' as const,
        settings: {
          delivery_available: shopData.delivery_available ?? false,
          pickup_available: shopData.pickup_available ?? true,
          operating_hours: shopData.operating_hours ?? {
            open: "08:00",
            close: "18:00",
            days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
          },
          contact_info: {
            whatsapp: shopData.owner_phone,
            address: shopData.address
          }
        }
      };

      // Insert shop into database
      const { data, error } = await supabase
        .from('shops')
        .insert([newShop])
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Error creating shop in database');
        throw new ShopServiceError('Failed to create shop', { cause: error });
      }

      // Update user record to mark as shop owner
      await this.updateUserShopOwnerStatus(shopData.owner_phone, data.id);

      logger.info({ shopId: data.id, ownerPhone: shopData.owner_phone }, 'Shop created successfully');
      return data;

    } catch (error) {
      if (error instanceof ShopServiceError) throw error;
      logger.error({ error }, 'Unexpected error creating shop');
      throw new ShopServiceError('Failed to create shop', { cause: error });
    }
  }

  /**
   * Get shop by owner phone number
   */
  async getShopByOwner(ownerPhone: string): Promise<Shop | null> {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_phone', ownerPhone)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || null;
    } catch (error) {
      logger.error({ error, ownerPhone }, 'Error fetching shop by owner');
      throw new ShopServiceError('Failed to fetch shop', { cause: error });
    }
  }

  /**
   * Check if shop name is already taken in community
   */
  async isShopNameTaken(name: string, community: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('id')
        .eq('name', name.trim())
        .eq('community', community)
        .limit(1);

      if (error) throw error;
      return data.length > 0;
    } catch (error) {
      logger.error({ error, name, community }, 'Error checking shop name availability');
      throw new ShopServiceError('Failed to check shop name availability', { cause: error });
    }
  }

  /**
   * Get shops by community
   */
  async getShopsByComm‌unity(community: string, status: 'active' | 'all' = 'active'): Promise<Shop[]> {
    try {
      let query = supabase
        .from('shops')
        .select('*')
        .eq('community', community)
        .order('created_at', { ascending: false });

      if (status === 'active') {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, community }, 'Error fetching shops by community');
      throw new ShopServiceError('Failed to fetch shops', { cause: error });
    }
  }

  /**
   * Update user's shop owner status
   */
  private async updateUserShopOwnerStatus(phone: string, shopId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          user_type: 'seller',
          shop_id: shopId,
          updated_at: new Date().toISOString()
        })
        .eq('phone', phone);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, phone, shopId }, 'Error updating user shop owner status');
      throw new ShopServiceError('Failed to update user status', { cause: error });
    }
  }

  /**
   * Get available shop categories
   */
  getShopCategories(): string[] {
    return [
      'General Store',
      'Food & Beverages',
      'Clothing & Fashion',
      'Electronics',
      'Health & Beauty',
      'Home & Garden',
      'Arts & Crafts',
      'Services',
      'Agriculture',
      'Other'
    ];
  }

  /**
   * Validate shop data
   */
  validateShopData(data: Partial<CreateShopData>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length < 2) {
      errors.push('Shop name must be at least 2 characters long');
    }

    if (data.name && data.name.trim().length > 50) {
      errors.push('Shop name must not exceed 50 characters');
    }

    if (!data.description || data.description.trim().length < 10) {
      errors.push('Shop description must be at least 10 characters long');
    }

    if (data.description && data.description.trim().length > 200) {
      errors.push('Shop description must not exceed 200 characters');
    }

    if (!data.category) {
      errors.push('Shop category is required');
    }

    if (data.category && !this.getShopCategories().includes(data.category)) {
      errors.push('Invalid shop category');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Create shop service instance
const shopService = new ShopService();
export { shopService };