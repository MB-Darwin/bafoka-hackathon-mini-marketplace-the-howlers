// src/services/bot.service.ts
import { WhatsAppService } from './whatsapp.service.js';
import { UserSessionService, UserSession } from './user.service.ts';
//import OrderService from './order.service.js';
//import CartItem from './order.service.js';
//import PaymentService from './payment.service.js';
//import ShopService, { Shop, Product } from './shop.service.js';
//import { BlockchainService } from './blockchain.service.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger.ts';
import { BotServiceError } from '../middleware/error-handler.ts';
import {supabase } from '../db/index.ts';

interface InteractiveButtonReply {
  id: string;
}

interface InteractiveListReply {
  id: string;
}

interface Interactive {
  buttonReply?: InteractiveButtonReply;
  listReply?: InteractiveListReply;
}

interface IncomingMessageData {
  from: string;
  text?: string;
  interactive?: Interactive;
}

interface Community {
  name: string;
  voucher: string;
  displayName: string;
}

interface ButtonOption {
  id: string;
  title: string;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface ListSection {
  title: string;
  rows: ListRow[];
}

interface ListMessage {
  text: string;
  buttonText: string;
  sections: ListSection[];
}

class BotService {
  private whatsappService: WhatsAppService;
  private userSessionService: UserSessionService;
  //private orderService: OrderService;
  //private paymentService: PaymentService;
 // private shopService: ShopService;
  //private blockchainService: BlockchainService;

  public COMMUNITIES: Record<string, Community>;
  public FLOWS: Record<string, string>;

  constructor() {
    this.whatsappService = new WhatsAppService();
    this.userSessionService = new UserSessionService();
    //this.orderService = new OrderService();
    //this.paymentService = new PaymentService();
    //this.shopService = new ShopService();
    //this.blockchainService = new BlockchainService();

    

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
    };
  }

  private async handleDefaultTextInput(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
  await this.whatsappService.sendMessage(
    phoneNumber,
    `❓ Sorry, I didn't understand "${message}". Please use the menu or type "help" for assistance.`
  );
}

  /** -------------------- PROCESS INCOMING MESSAGE -------------------- */
  public async processIncomingMessage(messageData: IncomingMessageData): Promise<void> {
    try {
      const { from, text, interactive } = messageData;
      const phoneNumber = from;

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

      if (interactive) {
        return await this.handleInteractiveResponse(phoneNumber, interactive, userSession);
      }

      if (text) {
        return await this.handleTextMessage(phoneNumber, text.toLowerCase().trim(), userSession);
      }
    } catch (error) {
      logger.error({ error }, 'Error processing incoming message:');
      await this.whatsappService.sendMessage(
        messageData.from,
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

        case 'create_shop': return await this.handleShopCreation(phoneNumber, userSession);
        case 'manage_shop': return await this.showShopManagement(phoneNumber, userSession);
        case 'view_shop_stats': return await this.showShopStatistics(phoneNumber, userSession);
        case 'add_product': return await this.initializeProductAddition(phoneNumber, userSession);
        case 'manage_products': return await this.showProductManagement(phoneNumber, userSession);
        case 'view_orders': return await this.showOrderManagement(phoneNumber, userSession);
        case 'order_details': return await this.showOrderDetails(phoneNumber, userSession);
        case 'update_order_status': return await this.handleOrderStatusUpdate(phoneNumber, userSession);
        case 'setup_payments': return await this.initializePaymentSetup(phoneNumber, userSession);
        case 'mobile_money_setup': return await this.handleMobileMoneySetup(phoneNumber, userSession);
        case 'crypto_setup': return await this.handleCryptoSetup(phoneNumber, userSession);
        case 'create_eos_account': return await this.handleEOSAccountCreation(phoneNumber, userSession);
        case 'check_eos_balance': return await this.handleEOSBalanceCheck(phoneNumber, userSession);
        case 'eos_transaction': return await this.handleEOSTransaction(phoneNumber, userSession);
        //case 'browse_shops': return await this.showCommunityShopBrowser(phoneNumber, userSession);
        //case 'view_products': return await this.showCommunityProductCatalog(phoneNumber, userSession);
        //case 'add_to_cart': return await this.handleAddToCart(phoneNumber, userSession, interactive);
        //case 'checkout': return await this.initializeCheckout(phoneNumber, userSession);
        case 'back_to_main': return await this.showMainMenu(phoneNumber);
        case 'back': return await this.handleBackNavigation(phoneNumber, userSession);
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
      if (this.isGlobalCommand(message)) {
        return await this.handleGlobalCommand(phoneNumber, message, userSession);
      }

      switch (userSession.currentFlow) {
        case this.FLOWS.COMMUNITY_SELECTION:
          return await this.handleCommunitySelectionText(phoneNumber, message, userSession);
        case this.FLOWS.SELLER_REGISTRATION:
          return await this.handleSellerRegistrationInput(phoneNumber, message, userSession);
        case this.FLOWS.BUYER_REGISTRATION:
          return await this.handleBuyerRegistrationInput(phoneNumber, message, userSession);
        case this.FLOWS.SHOP_MANAGEMENT:
          return await this.handleShopManagementInput(phoneNumber, message, userSession);
        case this.FLOWS.PRODUCT_MANAGEMENT:
          return await this.handleProductManagementInput(phoneNumber, message, userSession);
        case this.FLOWS.PAYMENT_SETUP:
          return await this.handlePaymentSetupInput(phoneNumber, message, userSession);
        case this.FLOWS.BLOCKCHAIN_SETUP:
          return await this.handleBlockchainSetupInput(phoneNumber, message, userSession);
        case this.FLOWS.CHECKOUT:
          return await this.handleCheckoutInput(phoneNumber, message, userSession);
        default:
          return await this.handleDefaultTextInput(phoneNumber, message, userSession);
      }
    } catch (error) {
      logger.error(`Error handling text message in flow ${userSession.currentFlow}:`,);
      throw new BotServiceError('Failed to process message', { cause: error });
    }
  }

  /** -------------------- COMMUNITY SELECTION -------------------- */
  private async initiateCommunitySelection(phoneNumber: string, userSession: UserSession, userType: 'seller' | 'buyer'): Promise<void> {
    await this.userSessionService.updateSession(phoneNumber, {
      currentFlow: this.FLOWS.COMMUNITY_SELECTION,
      userData: { ...userSession.userData, pendingUserType: userType },
    });

    const welcomeText = `🌍 Welcome to our Community Marketplace!

Please select your community to access your local marketplace:

Each community has its own voucher system that can only be used within that community.`;

    const buttons: ButtonOption[] = [
      { id: 'select_bameka', title: '🏘️ BAMEKA' },
      { id: 'select_batoufam', title: '🏘️ BATOUFAM' },
      { id: 'select_fondjomekwet', title: '🏘️ FONDJOMEKWET' },
    ];

    await this.whatsappService.sendButtonMessage(phoneNumber, welcomeText, buttons);
  }

  private async handleCommunitySelection(phoneNumber: string, userSession: UserSession, communityName: string): Promise<void> {
    const community = this.COMMUNITIES[communityName];
    const pendingUserType = userSession.userData.pendingUserType;
    let userType: "seller" | "buyer" | null = null;

    if (pendingUserType === "seller" || pendingUserType === "buyer") {
  userType = pendingUserType;
      }

    const updatedSession: Partial<UserSession> = {
      community: communityName,
      communityVoucher: community.voucher,
      userType,
      currentFlow: userType === 'seller' ? this.FLOWS.SELLER_REGISTRATION : this.FLOWS.BUYER_REGISTRATION,
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
        await this.whatsappService.sendMessage(phoneNumber, `🎁 Welcome! You have been allocated a default voucher balance of ${voucherBalance} ${community.voucher} to start shopping in your community!`);
      }
    } catch (error) {
      logger.error({ error }, 'Error updating user in Supabase:');
     await this.whatsappService.sendMessage(phoneNumber, '❌ There was a problem saving your community selection. Please try again.');
    }

    if (userType === 'seller') {
  const sellerSession = await this.userSessionService.getSession(phoneNumber);
  if (!sellerSession) {
    // Stop execution if session is null
  await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Unable to retrieve your session. Please try again.'
    );
    return;
  }
  return await this.initializeSellerFlow(phoneNumber, sellerSession);
} else {
  const buyerSession = await this.userSessionService.getSession(phoneNumber);
  if (!buyerSession) {
    await this.whatsappService.sendMessage(
      phoneNumber,
      '❌ Unable to retrieve your session. Please try again.'
    );
    return;
  }
  return await this.initializeBuyerFlow(phoneNumber, buyerSession);
}
  }


  private async handleCommunitySelectionText(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    const communityMap: Record<string, string> = {
      'bameka': 'BAMEKA', '1': 'BAMEKA',
      'batoufam': 'BATOUFAM', '2': 'BATOUFAM',
      'fondjomekwet': 'FONDJOMEKWET', 'fondjo': 'FONDJOMEKWET', '3': 'FONDJOMEKWET'
    };

    const selectedCommunity = communityMap[message];
    if (selectedCommunity) {
      return await this.handleCommunitySelection(phoneNumber, userSession, selectedCommunity);
    } else {
      await this.whatsappService.sendMessage(phoneNumber, '❌ Invalid selection. Please choose from:\n1️⃣ BAMEKA\n2️⃣ BATOUFAM\n3️⃣ FONDJOMEKWET\n\nOr use the buttons above.');
    }
  }

  /** -------------------- SELLER & BUYER FLOWS -------------------- */
  private async initializeSellerFlow(phoneNumber: string, userSession: UserSession): Promise<void> {
    const community = userSession.userData?.communityDisplayName || 'your community';

    const welcomeText = `🏪 Welcome, ${community} Seller!

Let's set up your marketplace presence in your community. You can:
• Create and manage your shop
• Add and manage products  
• Track orders and sales within ${community}
• Set up payment methods
• Configure EOS blockchain integration

Your products will only be visible to buyers from ${community}.

Choose an option to get started:`;

    const buttons: ButtonOption[] = [
      { id: 'create_shop', title: '🏪 Create Shop' },
      { id: 'manage_shop', title: '⚙️ Manage Shop' },
      { id: 'setup_payments', title: '💳 Setup Payments' },
      { id: 'create_eos_account', title: '🔗 EOS Account' },
    ];

    await this.whatsappService.sendButtonMessage(phoneNumber, welcomeText, buttons);
  }

  private async initializeBuyerFlow(phoneNumber: string, userSession: UserSession): Promise<void> {
    const community = userSession.userData?.communityDisplayName || 'your community';

    const welcomeText = `🛒 Welcome, ${community} Buyer!

Explore your local marketplace! You can:
• Browse shops in ${community}
• View products from local sellers
• Add items to your cart
• Pay using your ${userSession.userData?.communityVoucher}

You can only purchase from sellers in ${community}.

What would you like to do?`;

    const buttons: ButtonOption[] = [
      { id: 'browse_shops', title: '🏪 Browse Shops' },
      { id: 'view_products', title: '📦 View Products' },
      { id: 'checkout', title: '🛒 My Cart' },
      { id: 'back_to_main', title: '🏠 Main Menu' },
    ];

    await this.whatsappService.sendButtonMessage(phoneNumber, welcomeText, buttons);
  }

  /** -------------------- COMMUNITY MARKETPLACE -------------------- */
 /* private async showCommunityShopBrowser(phoneNumber: string, userSession: UserSession): Promise<void> {
    try {
      const userCommunity = userSession.community!;
      const communityShops: Shop[] = await this.shopService.getShopsByCommunity(userCommunity);

      if (!communityShops.length) {
        return await this.whatsappService.sendMessage(phoneNumber, `😔 No shops found in ${userSession.userData?.communityDisplayName} yet.\n\nBe the first to create a shop or check back later!`);
      }

      const shopList: ListRow[] = communityShops.map((shop, idx) => ({
        id: `shop_${shop.id}`,
        title: shop.name,
        description: `${shop.description?.substring(0, 60) || 'Local shop'}... | Products: ${shop.productCount || 0}`,
      }));

      const listMessage: ListMessage = {
        text: `🏪 Shops in ${userSession.userData?.communityDisplayName}:\n\nSelect a shop to explore:`,
        buttonText: 'Select Shop',
        sections: [{ title: 'Available Shops', rows: shopList }],
      };

      return await this.whatsappService.sendListMessage(phoneNumber, listMessage);
    } catch (error) {
      logger.error('Error showing community shop browser:', error);
      throw new BotServiceError('Failed to load community shops', { cause: error });
    }
  }

  private async showCommunityProductCatalog(phoneNumber: string, userSession: UserSession): Promise<void> {
    try {
      const community = userSession.community!;
      const products: Product[] = await this.shopService.getProductsByCommunity(community);

      if (!products.length) {
        return await this.whatsappService.sendMessage(phoneNumber, `😔 No products found in ${userSession.userData?.communityDisplayName} yet.`);
      }

      const productList: ListRow[] = products.map(p => ({
        id: `product_${p.id}`,
        title: p.name,
        description: `💰 ${p.price} ${userSession.communityVoucher} | Stock: ${p.stock}`,
      }));

      const listMessage: ListMessage = {
        text: `📦 Products available in ${userSession.userData?.communityDisplayName}:`,
        buttonText: 'View Products',
        sections: [{ title: 'Products', rows: productList }],
      };

      return await this.whatsappService.sendListMessage(phoneNumber, listMessage);
    } catch (error) {
      logger.error('Error showing product catalog:', error);
      throw new BotServiceError('Failed to load products', { cause: error });
    }
  }

  /** -------------------- CART & CHECKOUT -------------------- */
 /* private async handleAddToCart(phoneNumber: string, userSession: UserSession, interactive: Interactive): Promise<void> {
    try {
      const productId = interactive.listReply?.id.split('_')[1];
      if (!productId) return;

      const product = await this.shopService.getProductById(productId);
      if (!product) return await this.whatsappService.sendMessage(phoneNumber, '❌ Product not found.');

      await this.orderService.addToCart(phoneNumber, product, 1);
      return await this.whatsappService.sendMessage(phoneNumber, `✅ ${product.name} added to your cart.`);
    } catch (error) {
      logger.error('Error adding product to cart:', error);
      throw new BotServiceError('Failed to add product to cart', { cause: error });
    }
  }

  private async initializeCheckout(phoneNumber: string, userSession: UserSession): Promise<void> {
    try {
      const cartItems: CartItem[] = await this.orderService.getCart(phoneNumber);
      if (!cartItems.length) return await this.whatsappService.sendMessage(phoneNumber, '🛒 Your cart is empty.');

      let cartSummary = `🛒 Checkout Summary:\n\n`;
      let total = 0;
      cartItems.forEach(item => {
        cartSummary += `• ${item.product.name} x${item.quantity} = ${item.product.price * item.quantity} ${userSession.communityVoucher}\n`;
        total += item.product.price * item.quantity;
      });
      cartSummary += `\nTotal: ${total} ${userSession.userData?.communityVoucher}`;

      const buttons: ButtonOption[] = [
        { id: 'checkout_confirm', title: '✅ Confirm Payment' },
        { id: 'back', title: '⬅️ Back' },
      ];

      await this.whatsappService.sendButtonMessage(phoneNumber, cartSummary, buttons);
    } catch (error) {
      logger.error('Error initializing checkout:', error);
      throw new BotServiceError('Failed to initialize checkout', { cause: error });
    }
  }

  /** -------------------- UTILITY -------------------- */
  private isGlobalCommand(message: string): boolean {
    return ['help', 'menu', 'start'].includes(message);
  }

  private async handleGlobalCommand(phoneNumber: string, message: string, userSession: UserSession): Promise<void> {
    if (message === 'menu' || message === 'start') {
      return await this.showMainMenu(phoneNumber);
    }
    if (message === 'help') {
      await this.whatsappService.sendMessage(phoneNumber, 'ℹ️ Help Menu:\n• Type "menu" to go to main menu\n• Use the buttons to navigate');
    }
  }

  private async showMainMenu(phoneNumber: string): Promise<void> {
    const buttons: ButtonOption[] = [
      { id: 'seller_register', title: '🏪 Seller' },
      { id: 'buyer_browse', title: '🛒 Buyer' },
    ];

    await this.whatsappService.sendButtonMessage(phoneNumber, '🏠 Main Menu: Choose your role', buttons);
  }

  private async handleUnknownResponse(phoneNumber: string): Promise<void> {
    await this.whatsappService.sendMessage(phoneNumber, '❌ Unknown selection. Please choose a valid option.');
  }

  private async handleBackNavigation(phoneNumber: string, userSession: UserSession): Promise<void> {
    return await this.showMainMenu(phoneNumber);
  }
  

  // -------------------- PLACEHOLDER METHODS --------------------
  // These should be implemented similarly with proper typing
  private async handleSellerRegistrationInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handleBuyerRegistrationInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handleShopManagementInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handleProductManagementInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handlePaymentSetupInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handleBlockchainSetupInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }
  private async handleCheckoutInput(phoneNumber: string, message: string, userSession: UserSession) { /* ... */ }

  private async handleShopCreation(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async showShopManagement(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async showShopStatistics(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async initializeProductAddition(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async showProductManagement(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async showOrderManagement(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async showOrderDetails(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleOrderStatusUpdate(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async initializePaymentSetup(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleMobileMoneySetup(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleCryptoSetup(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleEOSAccountCreation(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleEOSBalanceCheck(phoneNumber: string, userSession: UserSession) { /* ... */ }
  private async handleEOSTransaction(phoneNumber: string, userSession: UserSession) { /* ... */ }

}

export default BotService;
