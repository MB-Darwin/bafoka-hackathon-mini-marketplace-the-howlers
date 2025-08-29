# WhatsApp Bot Mini Marketplace

A robust WhatsApp-based marketplace bot built with Express.js, TypeScript, and Twilio API. Features blockchain payments via Celo network, enabling secure crypto transactions through conversational commerce.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │────│   Twilio API    │────│   Express App   │
│   Messages      │    │   Webhooks      │    │   (TypeScript)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                              ┌─────────────────────────┼─────────────────────────┐
                              │                         │                         │
                    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
                    │   Supabase      │    │   Celo Network  │    │   Pino Logger   │
                    │   PostgreSQL    │    │   Blockchain    │    │   Structured    │
                    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x+
- TypeScript 4.9+
- pnpm 8.x+
- Supabase account
- Celo wallet and testnet access
- Twilio Account with WhatsApp Business API access
- ngrok (for local development)

### Installation

```bash
git clone <repository-url>
cd whatsapp-bot-marketplace
pnpm install
```

### Environment Configuration

```bash
cp .env.example .env
```

Required environment variables:

```env
# Server Configuration
NODE_ENV=development
PORT=8080
API_VERSION=v1

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=whatsapp:+1234567890

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Celo Blockchain Configuration
CELO_NETWORK=alfajores # or mainnet
CELO_PRIVATE_KEY=your_wallet_private_key
CELO_RPC_URL=https://alfajores-forno.celo-testnet.org
CELO_MARKETPLACE_CONTRACT=0x...
CUSD_TOKEN_ADDRESS=0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1 # Alfajores cUSD

# Security
JWT_SECRET=your-super-secure-jwt-secret
WEBHOOK_VERIFY_TOKEN=your-webhook-verification-token
ENCRYPTION_KEY=your-32-character-encryption-key

# Redis (for session management)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## 📁 Project Structure

```
src/
├── controllers/          # Route controllers
│   ├── webhook.controller.ts
│   ├── product.controller.ts
│   └── order.controller.ts
├── services/            # Business logic
│   ├── whatsapp.service.ts
│   ├── marketplace.service.ts
│   ├── celo-payment.service.ts
│   └── supabase.service.ts
├── models/              # Database models
│   ├── user.model.ts
│   ├── product.model.ts
│   └── order.model.ts
├── middleware/          # Custom middleware
│   ├── auth.middleware.ts
│   ├── validation.middleware.ts
│   └── rate-limit.middleware.ts
├── utils/               # Utility functions
│   ├── twilio.util.ts
│   ├── message-parser.util.ts
│   ├── celo.util.ts
│   ├── logger.util.ts
│   └── crypto.util.ts
├── types/               # TypeScript type definitions
├── config/              # Configuration files
└── __tests__/           # Test files
```

## 🔧 Development

### Start Development Server

```bash
# With hot reload
pnpm dev

# Build and run
pnpm build
pnpm start
```

### Twilio Webhook Setup

1. Start your local server with ngrok:
```bash
ngrok http 8080
```

2. Configure webhook URL in Twilio Console:
```
https://your-ngrok-url.com/api/v1/webhook/whatsapp
```

### Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)

2. Run database migrations:
```bash
pnpm supabase:migrate
```

3. Setup Row Level Security (RLS) policies:
```sql
-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Vendors can manage own products" ON products
  FOR ALL USING (vendor_id = auth.uid());
```

### Celo Blockchain Setup

1. Install Celo SDK dependencies:
```bash
pnpm add @celo/contractkit @celo/wallet-local
```

2. Setup Celo testnet wallet:
```bash
# Generate new wallet or import existing
pnpm celo:wallet:create
```

3. Fund testnet wallet:
- Visit [Alfajores Faucet](https://celo.org/developers/faucet)
- Add your wallet address
- Receive testnet CELO and cUSD

4. Deploy marketplace contract:
```bash
pnpm hardhat deploy --network alfajores
```

## 🎯 Bot Commands & Features

### User Commands
- `*menu*` - Display main marketplace menu
- `*browse [category]*` - Browse products by category
- `*search [query]*` - Search for products
- `*cart*` - View shopping cart
- `*checkout*` - Proceed to checkout
- `*orders*` - View order history
- `*help*` - Display help menu

### Vendor Commands
- `*vendor register*` - Register as vendor
- `*add product*` - Add new product
- `*manage products*` - Manage product inventory
- `*orders*` - View vendor orders
- `*analytics*` - View sales analytics

### Admin Commands
- `*admin stats*` - Platform statistics
- `*manage vendors*` - Vendor management
- `*broadcast [message]*` - Send broadcast message

## 📊 API Endpoints

### Webhook Endpoints
```typescript
POST /api/v1/webhook/whatsapp     # Twilio webhook
GET  /api/v1/webhook/verify       # Webhook verification
```

### REST API
```typescript
GET    /api/v1/products           # List products
POST   /api/v1/products           # Create product (vendor)
GET    /api/v1/products/:id       # Get product details
PUT    /api/v1/products/:id       # Update product (vendor)
DELETE /api/v1/products/:id       # Delete product (vendor)

GET    /api/v1/orders             # List orders
POST   /api/v1/orders             # Create order
GET    /api/v1/orders/:id         # Get order details
PUT    /api/v1/orders/:id/status  # Update order status

GET    /api/v1/users/profile      # Get user profile
PUT    /api/v1/users/profile      # Update user profile
```

## 🛡️ Security Features

### Rate Limiting
```typescript
// Configure in middleware/rate-limit.middleware.ts
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});
```

### Message Validation
- Webhook signature verification
- Input sanitization
- SQL injection prevention
- XSS protection

### Data Encryption
- PII encryption at rest
- Secure token generation
- Password hashing with bcrypt

## 🔌 Integrations

### Celo Blockchain Payments
```typescript
// Celo payment service example
import { ContractKit, newKit } from '@celo/contractkit';
import { LocalWallet } from '@celo/wallet-local';

const kit = newKit(process.env.CELO_RPC_URL!);
const wallet = new LocalWallet();
wallet.addAccount(process.env.CELO_PRIVATE_KEY!);
kit.connection.addAccount(wallet.getAccounts()[0]);

export const transferCUSD = async (to: string, amount: string) => {
  const cUSD = await kit.contracts.getStableToken();
  const tx = await cUSD.transfer(to, kit.connection.web3.utils.toWei(amount, 'ether'));
  
  const receipt = await tx.waitReceipt();
  return receipt.transactionHash;
};

export const getBalance = async (address: string) => {
  const cUSD = await kit.contracts.getStableToken();
  const balance = await cUSD.balanceOf(address);
  return kit.connection.web3.utils.fromWei(balance.toString(), 'ether');
};
```

### Supabase Integration
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const createUser = async (userData: UserData) => {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select();
    
  if (error) throw error;
  return data[0];
};

export const getProductsByVendor = async (vendorId: string) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('vendor_id', vendorId);
    
  if (error) throw error;
  return data;
};
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run integration tests
pnpm test:integration

# Run specific test file
pnpm test -- --testPathPattern=webhook.test.ts
```

### Test Structure
```typescript
// Example test file
describe('WhatsApp Webhook Controller', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  it('should process incoming message', async () => {
    const response = await request(app)
      .post('/api/v1/webhook/whatsapp')
      .send(mockTwilioPayload)
      .expect(200);
    
    expect(response.body.status).toBe('success');
  });
});
```

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod

COPY dist ./dist
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - CELO_NETWORK=alfajores
    depends_on:
      - redis
  
  redis:
    image: redis:alpine
```

### Production Deployment (Railway/Render/Vercel)

1. **Environment Variables**: Set all production environment variables
2. **Supabase**: Configure production database with proper RLS policies
3. **Celo Mainnet**: Switch to mainnet for production payments
4. **Webhook URL**: Update Twilio webhook to production URL
5. **SSL**: Ensure HTTPS is enabled
6. **Monitoring**: Set up logging and monitoring with Pino

### Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

## 📈 Monitoring & Analytics

### Pino Logging
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-mm-dd HH:MM:ss'
    }
  } : undefined,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'token'],
    censor: '***REDACTED***'
  }
});

// Usage examples
logger.info({ userId, action: 'payment_initiated' }, 'User initiated payment');
logger.error({ error: err.message, stack: err.stack }, 'Payment failed');
logger.warn({ walletAddress, amount }, 'Large transaction detected');
```

### Blockchain Analytics
```typescript
// Track blockchain transactions
export const logBlockchainTransaction = (
  txHash: string,
  from: string,
  to: string,
  amount: string,
  token: 'CELO' | 'cUSD'
) => {
  logger.info({
    transaction: {
      hash: txHash,
      from,
      to,
      amount,
      token,
      network: process.env.CELO_NETWORK
    }
  }, 'Blockchain transaction processed');
};
```

### Metrics Collection
- Message processing time
- Blockchain transaction success rates
- cUSD/CELO conversion rates
- Gas fee optimization
- User engagement rates
- Smart contract interaction metrics
- Error rates and types

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Standards
- ESLint + Prettier configuration
- Conventional Commits
- 90%+ test coverage requirement
- TypeScript strict mode
- Pino structured logging
- Supabase RLS security policies

## 📚 Documentation

### API Documentation
Generate API docs with Swagger:
```bash
pnpm docs:generate
```

### Bot Flow Documentation
See `docs/bot-flows.md` for detailed conversation flows and state management.

### Blockchain Integration Guide
See `docs/celo-integration.md` for smart contract deployment and payment flow documentation.

## 🐛 Troubleshooting

### Common Issues

**Webhook not receiving messages:**
- Verify ngrok is running and URL is correct
- Check Twilio webhook configuration
- Validate webhook signature verification

**Supabase connection issues:**
- Check SUPABASE_URL and keys
- Verify RLS policies are correctly configured
- Ensure service role key has proper permissions

**Blockchain transaction failures:**
- Verify wallet has sufficient CELO for gas fees
- Check network connectivity to Celo RPC
- Validate contract addresses for current network
- Monitor gas price fluctuations

**Message sending failures:**
- Validate Twilio credentials
- Check phone number format
- Verify WhatsApp Business API approval

## 📊 Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "db:migrate": "supabase db reset",
    "db:generate": "supabase gen types typescript --local > src/types/supabase.ts",
    "celo:deploy": "hardhat deploy --network alfajores",
    "celo:verify": "hardhat verify --network alfajores",
    "docs:generate": "swagger-jsdoc -d swaggerDef.js src/routes/*.ts -o swagger.json"
  }
}

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Twilio WhatsApp API Documentation](https://www.twilio.com/docs/whatsapp)
- [Celo Developer Documentation](https://docs.celo.org/)
- [Supabase Documentation](https://supabase.com/docs)
- [Pino Logging Documentation](https://getpino.io/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [pnpm Documentation](https://pnpm.io/)

---

**Need help?** Create an issue or contact the development team.

**Production Status:** Ready for deployment with proper environment configuration.
