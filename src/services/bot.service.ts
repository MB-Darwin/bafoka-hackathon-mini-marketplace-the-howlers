// src/services/bot.service.ts
import { WhatsAppService } from './whatsapp.service.js';
import { UserSessionService, UserSession } from './user.service.ts';
import { supabase } from '../db/index.ts';
import logger from '../utils/logger.ts';
import { BotServiceError , ShopServiceError} from '../middleware/error-handler.ts';
import { shopService, CreateShopData } from './shop.service.ts';

interface InteractiveButtonReply { id: string; }
interface InteractiveListReply { id: string; }
interface Interactive { buttonReply?: InteractiveButtonReply; listReply?: InteractiveListReply; }

interface IncomingMessageData {
  from?: string;
  text?: string;
  interactive?: Interactive;
  raw?: Record<string, any>; // full Twilio payload optional
  // Twilio-specific fields
  From?: string;
  Body?: string;
  WaId?: string;
}

interface Community {
  name: string;
  voucher: string;
  displayName: string;
}

interface ButtonOption { id: string; title: string; }
interface ListRow { id: string; title: string; description?: string; }
interface ListSection { title: string; rows: ListRow[]; }
interface ListMessage { text: string; buttonText: string; sections: ListSection[]; }

class BotService {
  private whatsappService: WhatsAppService;
  private userSessionService: UserSessionService;
  public COMMUNITIES: Record<string, Community>;
  public FLOWS: Record<string, string>;

  constructor() {
    this.whatsappService = new WhatsAppService();
    this.userSessionService = new UserSessionService();
    

    this.COMMUNITIES = {
      BAMEKA: { name: 'BAMEKA', voucher: 'MUNKAP', displayName: '🏘️ BAMEKA' },
      BATOUFAM: { name: 'BATOUFAM', voucher: 'MBIP TSWEFAP', displayName: '🏘️ BATOUFAM' },
      FONDJOMEKWET: { name: 'FONDJOMEKWET', voucher: 'MBAM', displayName: '🏘️ FONDJOMEKWET' },
    };

    this.FLOWS = {
      MAIN_MENU: 'main_menu',
      COMMUNITY_SELECTION: 'community_selection',
      SELLER_REGISTRATION: 'seller_registration',
      BUYER_REGISTRATION: 'buyer_registration',
      SHOP_MANAGEMENT: 'shop_management',
      PRODUCT_MANAGEMENT: 'product_management',
      ORDER_MANAGEMENT: 'order_management',
      PAYMENT_SETUP: 'payment_setup',
      BLOCKCHAIN_SETUP: 'blockchain_setup',
      BUYER_BROWSING: 'buyer_browsing',
      CHECKOUT: 'checkout',
      SELLER_MENU: 'seller_menu',
      BUYER_MENU: 'buyer_menu',
      SHOP_NAME_INPUT: 'shop_name_input',
SHOP_DESCRIPTION_INPUT: 'shop_description_input',
SHOP_CATEGORY_SELECT: 'shop_category_select',
SHOP_SETTINGS_CONFIG: 'shop_settings_config',
SHOP_CONFIRMATION: 'shop_confirmation',
    };
  }

  /** -------------------- PROCESS INCOMING MESSAGE -------------------- */
  public async processIncomingMessage(messageData: IncomingMessageData & Record<string, any>): Promise<void> {
    try {
      // Normalize phone number
      const phoneNumber: string | undefined = messageData.from || messageData.From || messageData.WaId;
      if (!phoneNumber) {
        logger.error({ messageData }, 'No phone number found in incoming message.');
        return;
      }

      const text = messageData.text || messageData.Body;
      const interactive = messageData.interactive;

      // Retrieve or create session
      let userSession: UserSession | null = await this.userSessionService.getSession(phoneNumber);
      if (!userSession) {
        userSession = await this.userSessionService.createSession(phoneNumber);

        await supabase.from('users').upsert({
          phone: phoneNumber,
          user_data: userSession.userData,
          community: null,
          voucher_balance: 0,
          current_flow: this.FLOWS.MAIN_MENU,
        }, { onConflict: 'phone' });
      }

      // Handle interactive responses (keeping for backward compatibility)
      if (interactive) {
        return await this.handleInteractiveResponse(phoneNumber, interactive, userSession);
      }

      if (text) {
        return await this.handleTextMessage(phoneNumber, text.toLowerCase().trim(), userSession);
      }

      // Log raw payload if no text or interactive content
      logger.info({ messageData }, 'Received message with no text or interactive content.');

    } catch (error) {
      logger.error({ error }, 'Error processing incoming message:');
      const phoneNumber = messageData.from || messageData.From;
      if (!phoneNumber) {
          logger.warn('Cannot send error message: phone number is missing');
          return;
      }
       await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Sorry, something went wrong. Please try again or type "help" for assistance.'
        );
    }
  }

  /** -------------------- HANDLE INTERACTIVE RESPONSE -------------------- */
  private async handleInteractiveResponse(phoneNumber: string, interactive: Interactive, userSession: UserSession): Promise<void> {
    const responseId = interactive.buttonReply?.id || interactive.listReply?.id;
    if (!responseId) return;

    try {
      switch (responseId) {
        case 'seller_register': return await this.initiateCommunitySelection(phoneNumber, userSession, 'seller');
        case 'buyer_browse': return await this.initiateCommunitySelection(phoneNumber, userSession, 'buyer');
        case 'select_bameka': return await this.handleCommunitySelection(phoneNumber, userSession, 'BAMEKA');
        case 'select_batoufam': return await this.handleCommunitySelection(phoneNumber, userSession, 'BATOUFAM');
        case 'select_fondjomekwet': return await this.handleCommunitySelection(phoneNumber, userSession, 'FONDJOMEKWET');
        case 'back_to_main': return await this.showMainMenu(phoneNumber);
        case 'back': return await this.showMainMenu(phoneNumber);
        default: return await this.handleUnknownResponse(phoneNumber);
      }
    } catch (error) {
      logger.error({ error }, `Error handling interactive response ${responseId}:`);
      throw new BotServiceError(`Failed to process ${responseId}`, { cause: error });
    }
  }

  /** -------------------- HANDLE TEXT MESSAGE -------------------- */
 private async handleTextMessage(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
  try {
    // Global commands
    if (['help', 'menu', 'start', '0'].includes(message)) {
      return await this.showMainMenu(phoneNumber);
    }

    switch (userSession.currentFlow) {
      case this.FLOWS.MAIN_MENU:
        return await this.handleMainMenuInput(phoneNumber, message, userSession);
      
      case this.FLOWS.COMMUNITY_SELECTION:
        return await this.handleCommunitySelectionInput(phoneNumber, message, userSession);
      
      case this.FLOWS.SELLER_MENU:
        return await this.handleSellerMenuInput(phoneNumber, message, userSession);
      
      case this.FLOWS.BUYER_MENU:
        return await this.handleBuyerMenuInput(phoneNumber, message, userSession);
      
      // Shop creation flows
      case this.FLOWS.SHOP_NAME_INPUT:
      case this.FLOWS.SHOP_DESCRIPTION_INPUT:
      case this.FLOWS.SHOP_CATEGORY_SELECT:
      case this.FLOWS.SHOP_CONFIRMATION:
        return await this.handleShopCreationFlow(phoneNumber, message, userSession);
      
      default:
        await this.whatsappService.sendMessage(
          phoneNumber,
          `❓ Sorry, I didn't understand "${message}". Type "0" to return to main menu.`
        );
    }
  } catch (error) {
    logger.error({ error }, `Error handling text message in flow ${userSession.currentFlow}:`);
    throw new BotServiceError('Failed to process message', { cause: error });
  }
}

  /** -------------------- MAIN MENU HANDLING -------------------- */
  private async handleMainMenuInput(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    switch (message) {
      case '1':
        return await this.initiateCommunitySelection(phoneNumber, userSession, 'seller');
      case '2':
        return await this.initiateCommunitySelection(phoneNumber, userSession, 'buyer');
      default:
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Invalid option. Please choose:\n1️⃣ for Seller\n2️⃣ for Buyer\n0️⃣ for Menu'
        );
    }
  }

  /** -------------------- COMMUNITY SELECTION -------------------- */
  private async initiateCommunitySelection(phoneNumber: string, userSession: UserSession, userType: 'seller' | 'buyer'): Promise<void> {
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.COMMUNITY_SELECTION,
      userData: { ...userSession.userData, pendingUserType: userType },
    });

    const welcomeText = `🌍 Welcome to our Community Marketplace!

Please select your community:
1️⃣ 🏘️ BAMEKA
2️⃣ 🏘️ BATOUFAM  
3️⃣ 🏘️ FONDJOMEKWET
0️⃣ 🏠 Main Menu

Reply with the number of your choice.`;

    await this.whatsappService.sendMessage(phoneNumber, welcomeText);
  }

  private async handleCommunitySelectionInput(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    const communityMap: Record<string, string> = {
      '1': 'BAMEKA',
      '2': 'BATOUFAM', 
      '3': 'FONDJOMEKWET',
      'bameka': 'BAMEKA',
      'batoufam': 'BATOUFAM',
      'fondjomekwet': 'FONDJOMEKWET',
      'fondjo': 'FONDJOMEKWET'
    };

    if (message === '0') {
      return await this.showMainMenu(phoneNumber);
    }

    const selectedCommunity = communityMap[message];
    if (selectedCommunity) {
      return await this.handleCommunitySelection(phoneNumber, userSession, selectedCommunity);
    }

    await this.whatsappService.sendMessage(
      phoneNumber, 
      '❌ Invalid selection. Please choose:\n1️⃣ BAMEKA\n2️⃣ BATOUFAM\n3️⃣ FONDJOMEKWET\n0️⃣ Main Menu'
    );
  }

  private async handleCommunitySelection(phoneNumber: string, userSession: UserSession, communityName: string): Promise<void> {
    const community = this.COMMUNITIES[communityName];
    const pendingUserType = userSession.userData.pendingUserType;
    const userType = (pendingUserType === 'seller' || pendingUserType === 'buyer') ? pendingUserType : null;

    const updatedSession: Partial<UserSession> = {
      community: communityName,
      communityVoucher: community.voucher,
      userType,
      currentFlow: userType === 'seller' ? this.FLOWS.SELLER_MENU : this.FLOWS.BUYER_MENU,
      userData: { ...userSession.userData, community: communityName, communityDisplayName: community.displayName },
    };

    await this.userSessionService.updateSession(phoneNumber, updatedSession);

    try {
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phoneNumber)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const voucherBalance = existingUser?.voucher_balance || 100;

      await supabase.from('users').upsert({
        phone: phoneNumber,
        user_data: updatedSession.userData,
        community: communityName,
        voucher_balance: voucherBalance,
        current_flow: updatedSession.currentFlow,
      }, { onConflict: 'phone' });

      if (!existingUser) {
        await this.whatsappService.sendMessage(phoneNumber, `🎁 You have ${voucherBalance} ${community.voucher} to start shopping!`);
      }

      if (userType === 'seller') {
        return await this.showSellerMenu(phoneNumber, updatedSession as UserSession);
      } else {
        return await this.showBuyerMenu(phoneNumber, updatedSession as UserSession);
      }

    } catch (error) {
      logger.error({ error }, 'Error updating user in Supabase:');
      await this.whatsappService.sendMessage(phoneNumber, '❌ Could not save your community selection. Try again.');
    }
  }

  /** -------------------- SELLER MENU -------------------- */
  private async showSellerMenu(phoneNumber: string, userSession: UserSession): Promise<void> {
    const community = userSession.userData?.communityDisplayName || 'your community';
    const menuText = `🏪 Welcome, ${community} Seller!

Choose an option:
1️⃣ 🏪 Create Shop
2️⃣ ⚙️ Manage Shop
3️⃣ 💳 Setup Payments
4️⃣ 🔗 EOS Account
0️⃣ 🏠 Main Menu

Reply with the number of your choice.`;

    await this.whatsappService.sendMessage(phoneNumber, menuText);
  }

 // In BotService class - update handleSellerMenuInput method:
async handleSellerMenuInput(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
  switch (message) {
    case '1':
      return await this.initiateShopCreation(phoneNumber, userSession);
    
    case '2':
      return await this.handleManageShop(phoneNumber, userSession);
    
    case '3':
      await this.whatsappService.sendMessage(phoneNumber, '💳 Setup Payments feature coming soon!');
      return await this.showSellerMenu(phoneNumber, userSession);
    
    case '4':
      await this.whatsappService.sendMessage(phoneNumber, '🔗 EOS Account setup feature coming soon!');
      return await this.showSellerMenu(phoneNumber, userSession);
    
    case '0':
      return await this.showMainMenu(phoneNumber);
    
    default:
      await this.whatsappService.sendErrorMessage(
        phoneNumber,
        'Invalid option. Please choose 1-4 or 0 for main menu.',
        false
      );
      return await this.showSellerMenu(phoneNumber, userSession);
  }
}

async initiateShopCreation(phoneNumber: string, userSession: UserSession): Promise<void> {
  try {
    // Check if user already has a shop
    const existingShop = await shopService.getShopByOwner(phoneNumber);
    if (existingShop) {
      await this.whatsappService.sendMessage(
        phoneNumber,
        `🏪 You already have a shop: *${existingShop.name}*\n\nChoose option 2 from the menu to manage your existing shop.`
      );
      return await this.showSellerMenu(phoneNumber, userSession);
    }

    // Start shop creation flow
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.SHOP_NAME_INPUT,
      userData: { ...userSession.userData, shopCreation: {} }
    });

    await this.whatsappService.sendMessage(
      phoneNumber,
      `🏪 *Create Your Shop*

Let's set up your shop! I'll guide you through the process.

*Step 1 of 4: Shop Name*

Please enter your shop name (2-50 characters):

Example: "Maria's Fresh Produce" or "Tech Repair Hub"

Type "cancel" to return to the menu.`
    );

  } catch (error) {
    logger.error({ error }, 'Error initiating shop creation');
    await this.whatsappService.sendErrorMessage(phoneNumber, 'Could not start shop creation. Please try again.');
  }
}

async handleShopCreationFlow(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
  if (message === 'cancel') {
    await this.whatsappService.sendMessage(phoneNumber, '❌ Shop creation cancelled.');
    return await this.showSellerMenu(phoneNumber, userSession);
  }

  try {
    switch (userSession.currentFlow) {
      case this.FLOWS.SHOP_NAME_INPUT:
        return await this.handleShopNameInput(phoneNumber, message, userSession);
      
      case this.FLOWS.SHOP_DESCRIPTION_INPUT:
        return await this.handleShopDescriptionInput(phoneNumber, message, userSession);
      
      case this.FLOWS.SHOP_CATEGORY_SELECT:
        return await this.handleShopCategorySelect(phoneNumber, message, userSession);
      
      case this.FLOWS.SHOP_CONFIRMATION:
        return await this.handleShopConfirmation(phoneNumber, message, userSession);
    }
  } catch (error) {
    logger.error({ error }, 'Error in shop creation flow');
    await this.whatsappService.sendErrorMessage(phoneNumber, 'Something went wrong. Please try again.');
    return await this.showSellerMenu(phoneNumber, userSession);
  }
}

async handleShopNameInput(phoneNumber: string, name: string, userSession: UserSession): Promise<void> {
  // Validate name
  if (name.trim().length < 2) {
    await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Shop name too short. Please enter at least 2 characters.'
    );
  }

  if (name.trim().length > 50) {
  await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Shop name too long. Please keep it under 50 characters.'
    );
  }

  // Check if name is taken in community
  const nameTaken = await shopService.isShopNameTaken(name.trim(), userSession.community!);
  if (nameTaken) {
    await this.whatsappService.sendMessage(
      phoneNumber,
      `❌ Shop name "${name.trim()}" is already taken in ${userSession.userData.communityDisplayName}. Please choose a different name.`
    );
  }

  // Save name and move to description
  await this.userSessionService.updateSession(phoneNumber, {
    currentFlow: this.FLOWS.SHOP_DESCRIPTION_INPUT,
    userData: {
      ...userSession.userData,
      shopCreation: { ...userSession.userData.shopCreation, name: name.trim() }
    }
  });

  await this.whatsappService.sendMessage(
    phoneNumber,
    `✅ Great! Shop name: *${name.trim()}*

*Step 2 of 4: Shop Description*

Please describe your shop and what you sell (10-200 characters):

Example: "Fresh vegetables, fruits, and local produce. Open daily 8AM-6PM with home delivery available."

Type "back" to change the shop name.`
  );
}

async handleShopDescriptionInput(phoneNumber: string, description: string, userSession: UserSession): Promise<void> {
  if (description === 'back') {
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.SHOP_NAME_INPUT
    });
     await this.whatsappService.sendMessage(
      phoneNumber,
      '⬅️ Back to shop name. Please enter your shop name:'
    );
  }

  // Validate description
  if (description.trim().length < 10) {
    await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Description too short. Please enter at least 10 characters.'
    );
  }

  if (description.trim().length > 200) {
     await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Description too long. Please keep it under 200 characters.'
    );
  }

  // Save description and move to category selection
  await this.userSessionService.updateSession(phoneNumber, {
    currentFlow: this.FLOWS.SHOP_CATEGORY_SELECT,
    userData: {
      ...userSession.userData,
      shopCreation: { 
        ...userSession.userData.shopCreation, 
        description: description.trim() 
      }
    }
  });

  // Show category selection
  const categories = shopService.getShopCategories();
  const categoryList = categories
    .map((cat, index) => `${index + 1}️⃣ ${cat}`)
    .join('\n');

  await this.whatsappService.sendMessage(
    phoneNumber,
    `✅ Description saved!

*Step 3 of 4: Shop Category*

Please select your shop category:

${categoryList}

Type "back" to change description.`
  );
}

async handleShopCategorySelect(phoneNumber: string, input: string, userSession: UserSession): Promise<void> {
  if (input === 'back') {
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.SHOP_DESCRIPTION_INPUT
    });
    await this.whatsappService.sendMessage(
      phoneNumber,
      '⬅️ Back to description. Please enter your shop description:'
    );
  }

  const categories = shopService.getShopCategories();
  let selectedCategory: string | null = null;

  // Handle numeric input
  const categoryIndex = parseInt(input) - 1;
  if (categoryIndex >= 0 && categoryIndex < categories.length) {
    selectedCategory = categories[categoryIndex];
  }

  if (!selectedCategory) {
    const categoryList = categories
      .map((cat, index) => `${index + 1}️⃣ ${cat}`)
      .join('\n');
    
     await this.whatsappService.sendMessage(
      phoneNumber,
      `❌ Invalid selection. Please choose a number 1-${categories.length}:\n\n${categoryList}`
    );
  }

  // Save category and show confirmation
  const updatedShopData = {
    ...userSession.userData.shopCreation,
    category: selectedCategory
  };

  await this.userSessionService.updateSession(phoneNumber, {
    currentFlow: this.FLOWS.SHOP_CONFIRMATION,
    userData: {
      ...userSession.userData,
      shopCreation: updatedShopData
    }
  });

  // Show confirmation
  await this.whatsappService.sendMessage(
    phoneNumber,
    `*Step 4 of 4: Confirmation*

Please review your shop details:

🏪 *Shop Name:* ${updatedShopData.name}
📝 *Description:* ${updatedShopData.description}
🏷️ *Category:* ${selectedCategory}
🏘️ *Community:* ${userSession.userData.communityDisplayName}

1️⃣ ✅ Create Shop
2️⃣ ⬅️ Go Back
3️⃣ ❌ Cancel

Type your choice:`
  );
}

async handleShopConfirmation(phoneNumber: string, choice: string, userSession: UserSession): Promise<void> {
  switch (choice) {
    case '1':
      return await this.createShopFinal(phoneNumber, userSession);
    
    case '2':
      await this.userSessionService.updateSession(phoneNumber, {
        currentFlow: this.FLOWS.SHOP_CATEGORY_SELECT
      });
      await this.whatsappService.sendMessage(
        phoneNumber,
        '⬅️ Back to category selection. Please choose your shop category:'
      );
    
    case '3':
      await this.whatsappService.sendMessage(phoneNumber, '❌ Shop creation cancelled.');
      return await this.showSellerMenu(phoneNumber, userSession);
    
    default:
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Invalid choice. Please select:\n1️⃣ Create Shop\n2️⃣ Go Back\n3️⃣ Cancel'
      );
  }
}

async createShopFinal(phoneNumber: string, userSession: UserSession): Promise<void> {
  try {
    await this.whatsappService.sendProcessingMessage(phoneNumber, 'creating your shop');

    const shopData: CreateShopData = {
      name: userSession.userData.shopCreation.name,
      description: userSession.userData.shopCreation.description,
      category: userSession.userData.shopCreation.category,
      owner_phone: phoneNumber,
      community: userSession.community!
    };

    const newShop = await shopService.createShop(shopData);

    // Clear shop creation data and return to seller menu
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.SELLER_MENU,
      userData: {
        ...userSession.userData,
        shopCreation: undefined,
        shopId: newShop.id
      }
    });

    await this.whatsappService.sendSuccessMessage(
      phoneNumber,
      `🎉 Congratulations! Your shop "${newShop.name}" has been created successfully!`,
      'You can now manage your shop, add products, and start selling to your community.'
    );

    // Show seller menu
    setTimeout(() => this.showSellerMenu(phoneNumber, userSession), 2000);

  } catch (error) {
    logger.error({ error }, 'Error creating shop final step');
    
    if (error instanceof ShopServiceError) {
      await this.whatsappService.sendErrorMessage(phoneNumber, error.message);
    } else {
      await this.whatsappService.sendErrorMessage(phoneNumber, 'Failed to create shop. Please try again.');
    }
    
    return await this.showSellerMenu(phoneNumber, userSession);
  }
}

async handleManageShop(phoneNumber: string, userSession: UserSession): Promise<void> {
  try {
    const shop = await shopService.getShopByOwner(phoneNumber);
    
    if (!shop) {
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ You don\'t have a shop yet. Please create one first by selecting option 1.'
      );
      return await this.showSellerMenu(phoneNumber, userSession);
    }

    await this.whatsappService.sendMessage(
      phoneNumber,
      `🏪 *${shop.name}*
📝 ${shop.description}
🏷️ Category: ${shop.category}
📊 Status: ${shop.status}

*Shop Management:*
1️⃣ 📦 Add Products
2️⃣ 📋 View Products  
3️⃣ 📊 View Orders
4️⃣ ⚙️ Shop Settings
0️⃣ 🏠 Back to Menu

Shop management features coming soon!`
    );

  } catch (error) {
    logger.error({ error }, 'Error in manage shop');
    await this.whatsappService.sendErrorMessage(phoneNumber, 'Could not load shop information.');
  }
}

  /** -------------------- BUYER MENU -------------------- */
  private async showBuyerMenu(phoneNumber: string, userSession: UserSession): Promise<void> {
    const community = userSession.userData?.communityDisplayName || 'your community';
    const menuText = `🛒 Welcome, ${community} Buyer!

What would you like to do?
1️⃣ 🏪 Browse Shops
2️⃣ 📦 View Products  
3️⃣ 🛒 My Cart
4️⃣ 📋 My Orders
0️⃣ 🏠 Main Menu

Reply with the number of your choice.`;

    await this.whatsappService.sendMessage(phoneNumber, menuText);
  }

  private async handleBuyerMenuInput(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    switch (message) {
      case '1':
        await this.whatsappService.sendMessage(phoneNumber, '🏪 Browse Shops feature coming soon!');
        return await this.showBuyerMenu(phoneNumber, userSession);
      
      case '2':
        await this.whatsappService.sendMessage(phoneNumber, '📦 View Products feature coming soon!');
        return await this.showBuyerMenu(phoneNumber, userSession);
      
      case '3':
        await this.whatsappService.sendMessage(phoneNumber, '🛒 My Cart feature coming soon!');
        return await this.showBuyerMenu(phoneNumber, userSession);
      
      case '4':
        await this.whatsappService.sendMessage(phoneNumber, '📋 My Orders feature coming soon!');
        return await this.showBuyerMenu(phoneNumber, userSession);
      
      case '0':
        return await this.showMainMenu(phoneNumber);
      
      default:
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Invalid option. Please choose:\n1️⃣ Browse Shops\n2️⃣ View Products\n3️⃣ My Cart\n4️⃣ My Orders\n0️⃣ Main Menu'
        );
        return await this.showBuyerMenu(phoneNumber, userSession);
    }
  }

  /** -------------------- MENU & UTILITIES -------------------- */
  private async showMainMenu(phoneNumber: string): Promise<void> {
    // Update user session to main menu flow
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.MAIN_MENU
    });

    const menuText = `🏠 *Community Marketplace*

Choose your role:
1️⃣ 🏪 Seller
2️⃣ 🛒 Buyer

Reply with the number of your choice.
Type "help" for assistance.`;

    await this.whatsappService.sendMessage(phoneNumber, menuText);
  }

  private async handleUnknownResponse(phoneNumber: string): Promise<void> {
    await this.whatsappService.sendMessage(
      phoneNumber, 
      '❌ Unknown selection. Please choose a valid option or type "0" for main menu.'
    );
  }

  // Keep old methods for backward compatibility
  private async initializeSellerFlow(phoneNumber: string, userSession: UserSession): Promise<void> {
    return await this.showSellerMenu(phoneNumber, userSession);
  }

  private async initializeBuyerFlow(phoneNumber: string, userSession: UserSession): Promise<void> {
    return await this.showBuyerMenu(phoneNumber, userSession);
  }

  // Remove unused text handling method
  private async handleCommunitySelectionText(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    return await this.handleCommunitySelectionInput(phoneNumber, message, userSession);
  }
}

const botService = new BotService();
export { BotService, botService };