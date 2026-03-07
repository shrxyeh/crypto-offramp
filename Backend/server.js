const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

BigInt.prototype.toJSON = function() {
  return this.toString();
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const config = {
  port: process.env.PORT || 3001,
  rpcUrl: process.env.RPC_URL,
  contractAddress: process.env.CONTRACT_ADDRESS,
  platformFeeBps: 50, 
};

if (!config.rpcUrl || !config.contractAddress) {
  logger.error('Missing required environment variables!');
  logger.error('Required: RPC_URL, CONTRACT_ADDRESS');
  logger.error('Note: No private keys needed - backend is read-only');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Too many requests, please try again later' }, // Return JSON
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/parse-qr', limiter);
app.use('/api/calculate', limiter);

const provider = new ethers.JsonRpcProvider(config.rpcUrl);

logger.info(`RPC connected: ${config.rpcUrl}`);

const contractABI = [

  "event OrderCreated(uint256 indexed id, address indexed user, address token, uint256 amount, uint256 expiry)",
  "event OrderClaimed(uint256 indexed id, address indexed settler)",
  "event OrderCompleted(uint256 indexed id, address indexed settler, address indexed token, string utr)",
  "event OrderCancelled(uint256 indexed id, address indexed user, address indexed token, uint256 amount)",
  "event OrderDisputed(uint256 indexed id, address indexed user, address indexed token, string reason)",
  "event DisputeResolved(uint256 indexed id, bool refunded, address recipient, uint256 amount)",
  "event FeesWithdrawn(address indexed token, address indexed to, uint256 amount)",
  "event SettlerVerified(address indexed settler, bool verified)",
  "event TokenSupportUpdated(address indexed token, bool supported)",
  
  
  "function getOrder(uint256 orderId) external view returns (tuple(address user, address token, uint256 cryptoAmount, uint256 inrAmount, string merchantUpiId, uint256 expiryTime, address settler, uint8 status, string utrNumber))",
  "function getOrderCount() external view returns (uint256)",
  "function getUserOrders(address user) external view returns (uint256[] memory)",
  "function getSettlerOrders(address settler) external view returns (uint256[] memory)",
  "function getSettlerStats(address settler) external view returns (bool isVerified, uint256 reputation, uint256 totalOrders)",
  "function getOpenOrders() external view returns (uint256[] memory)",
  "function supportedTokens(address) external view returns (bool)",
  "function verifiedSettlers(address) external view returns (bool)",
  "function platformFeeBps() external view returns (uint256)",
  "function minOrderAmount() external view returns (uint256)",
  "function maxOrderAmount() external view returns (uint256)",
  "function collectedFees(address) external view returns (uint256)",
  "function lockedAmounts(address) external view returns (uint256)",
  "function owner() external view returns (address)",
  "function getTotalValueLocked(address token) external view returns (uint256)",
  "function getContractBalance(address token) external view returns (uint256)"
];

const contract = new ethers.Contract(config.contractAddress, contractABI, provider);

logger.info(`Contract: ${config.contractAddress}`);

const cache = {
  openOrders: [],
  lastOrdersFetch: 0,
  orderCache: new Map(),
  rates: { USDC: 83.5, USDT: 83.4 },
  lastRateUpdate: 0,
  lastBlockChecked: 0
};

class ConversionRateService {
  async updateRates() {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether&vs_currencies=inr'
      );
      
      if (!response.ok) throw new Error('CoinGecko API error');
      
      const data = await response.json();
      cache.rates.USDC = parseFloat(data['usd-coin']?.inr || 83.5);
      cache.rates.USDT = parseFloat(data['tether']?.inr || 83.4);
      cache.lastRateUpdate = Date.now();
      
      logger.info(`Rates updated: USDC=₹${cache.rates.USDC}, USDT=₹${cache.rates.USDT}`);
      
      return cache.rates;
    } catch (error) {
      logger.warn(`Rate update failed: ${error.message}`);
      return cache.rates;
    }
  }

  async getRate(token) {
    if (Date.now() - cache.lastRateUpdate > 60000) {
      await this.updateRates();
    }
    return cache.rates[token] || null;
  }

  getRates() {
    return cache.rates;
  }
}

const rateService = new ConversionRateService();

class OrderService {
  async getOpenOrders(forceRefresh = false) {
    if (!forceRefresh && Date.now() - cache.lastOrdersFetch < 2000) {
      logger.info(`Returning cached orders (${cache.openOrders.length})`);
      return cache.openOrders;
    }

    try {
      logger.info('Fetching open orders from contract...');
      
      const orderIds = await contract.getOpenOrders();
      logger.info(`Found ${orderIds.length} order IDs:`, orderIds.map(id => id.toString()));
      
      if (orderIds.length === 0) {
        logger.info('No open orders found');
        cache.openOrders = [];
        cache.lastOrdersFetch = Date.now();
        return [];
      }
      
      const orders = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const order = await this.getOrder(id.toString());
            logger.info(`Order ${id}: `, {
              orderId: order.orderId,
              status: order.status,
              inrAmount: order.inrAmount,
              cryptoAmount: order.cryptoAmount
            });
            return order;
          } catch (error) {
            logger.error(`Failed to fetch order ${id}:`, error.message);
            return null;
          }
        })
      );

      const validOrders = orders.filter(o => o !== null);
      
      cache.openOrders = validOrders;
      cache.lastOrdersFetch = Date.now();

      logger.info(`Successfully fetched ${validOrders.length} open orders`);

      return validOrders;
    } catch (error) {
      logger.error(`Failed to fetch open orders: ${error.message}`);
      logger.error('Stack:', error.stack);
      logger.info(`Returning ${cache.openOrders.length} cached orders due to error`);
      return cache.openOrders;
    }
  }

  async getOrder(orderId) {
  try {
    const cacheKey = `order_${orderId}`;
    if (cache.orderCache.has(cacheKey)) {
      const cached = cache.orderCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 1000) {
        return cached.data;
      }
    }

    const order = await contract.getOrder(orderId);

    const formatted = {
      orderId: orderId.toString(),
      user: order.user,
      token: order.token,
      cryptoAmount: ethers.formatUnits(order.cryptoAmount.toString(), 6),
      inrAmount: ethers.formatUnits(order.inrAmount.toString(), 18),
      merchantUpiId: order.merchantUpiId,
      expiryTime: Number(order.expiryTime.toString()),
      settler: order.settler,
      status: ['Open', 'Claimed', 'Completed', 'Disputed', 'Cancelled'][Number(order.status)],
      statusCode: Number(order.status),
      utrNumber: order.utrNumber || null,
      expiresAt: new Date(Number(order.expiryTime.toString()) * 1000).toISOString(),
      timeRemaining: Math.max(0, Number(order.expiryTime.toString()) - Math.floor(Date.now() / 1000)),
      hasSettler: order.settler !== ethers.ZeroAddress
    };

    cache.orderCache.set(cacheKey, {
      data: formatted,
      timestamp: Date.now()
    });

    return formatted;
  } catch (error) {
    logger.error(`Failed to fetch order ${orderId}: ${error.message}`);
    throw error;
  }
}
  
  async getUserOrders(address) {
    try {
      const orderIds = await contract.getUserOrders(address);
      const orders = await Promise.all(
        orderIds.map(id => this.getOrder(id.toString()))
      );
      return orders;
    } catch (error) {
      logger.error(`Failed to fetch user orders: ${error.message}`);
      throw error;
    }
  }

  async getSettlerOrders(address) {
    try {
      const orderIds = await contract.getSettlerOrders(address);
      const orders = await Promise.all(
        orderIds.map(id => this.getOrder(id.toString()))
      );
      return orders;
    } catch (error) {
      logger.error(`Failed to fetch settler orders: ${error.message}`);
      throw error;
    }
  }

  async getSettlerStats(address) {
    try {
      const stats = await contract.getSettlerStats(address);
      return {
        isVerified: stats.isVerified,
        reputation: stats.reputation.toString(),
        totalOrders: stats.totalOrders.toString()
      };
    } catch (error) {
      logger.error(`Failed to fetch settler stats: ${error.message}`);
      throw error;
    }
  }
}

const orderService = new OrderService();

class UPIService {
  isValidUPI(upiId) {
    return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upiId);
  }

  parseUPIQR(qrData) {
    try {
      let merchantData;
      try {
        const url = new URL(qrData);
        const params = new URLSearchParams(url.search);
        merchantData = {
          upiId: params.get('pa'),
          merchantName: params.get('pn') || 'Unknown Merchant',
          amount: params.get('am') || null,
        };
      } catch {
        const upiMatch = qrData.match(/pa=([^&]+)/);
        const nameMatch = qrData.match(/pn=([^&]+)/);
        
        if (upiMatch) {
          merchantData = {
            upiId: decodeURIComponent(upiMatch[1]),
            merchantName: nameMatch ? decodeURIComponent(nameMatch[1]) : 'Unknown Merchant',
            amount: null,
          };
        } else {
          throw new Error('Invalid UPI QR format');
        }
      }

      if (!merchantData?.upiId || !this.isValidUPI(merchantData.upiId)) {
        throw new Error('Invalid UPI ID in QR code');
      }

      return merchantData;
    } catch (error) {
      throw new Error(`QR parsing failed: ${error.message}`);
    }
  }
}

const upiService = new UPIService();

async function startEventMonitoring() {
  logger.info('Starting event monitoring...');
  
  cache.lastBlockChecked = await provider.getBlockNumber();

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      
      if (currentBlock > cache.lastBlockChecked) {
        logger.info(`Checking blocks ${cache.lastBlockChecked + 1} to ${currentBlock}`);
        
        const events = await contract.queryFilter('*', cache.lastBlockChecked + 1, currentBlock);
        
        if (events.length > 0) {
          logger.info(`Found ${events.length} events`);
          
          events.forEach(event => {
            logger.info(`Event: ${event.fragment?.name || 'Unknown'} - Block: ${event.blockNumber}`);
            
            const relevantEvents = ['OrderCreated', 'OrderClaimed', 'OrderCompleted', 'OrderCancelled', 'OrderDisputed'];
            if (relevantEvents.includes(event.fragment?.name)) {
              cache.lastOrdersFetch = 0; 
              
              if (event.args && event.args[0]) {
                const orderId = event.args[0].toString();
                cache.orderCache.delete(`order_${orderId}`);
                logger.info(`Cleared cache for order ${orderId}`);
              }
            
              if (event.fragment?.name === 'OrderCompleted') {
                logger.info('OrderCompleted detected - refreshing all caches NOW');
                cache.lastOrdersFetch = 0;
                cache.orderCache.clear(); 
               
                orderService.getOpenOrders(true).catch(err => {
                  logger.error('Failed to refresh after completion:', err);
                });
              }
            }
          });
        }
        
        cache.lastBlockChecked = currentBlock;
      }
    } catch (error) {
      if (!error.message.includes('ENOTFOUND') && !error.message.includes('ETIMEDOUT')) {
        logger.error(`Event monitoring error: ${error.message}`);
      }
    }
  }, 3000); 
}

app.get('/health', async (req, res) => {
  try {
    const [blockNumber, orderCount, platformFee, owner] = await Promise.all([
      provider.getBlockNumber(),
      contract.getOrderCount(),
      contract.platformFeeBps(),
      contract.owner()
    ]);

    res.json({
      status: 'healthy',
      mode: 'P2P',
      timestamp: new Date().toISOString(),
      blockchain: {
        connected: true,
        blockNumber,
        contractAddress: config.contractAddress,
      },
      contract: {
        owner,
        totalOrders: orderCount.toString(),
        platformFeeBps: platformFee.toString(),
      },
      cache: {
        openOrders: cache.openOrders.length,
        cachedOrders: cache.orderCache.size,
      },
      rates: cache.rates,
      note: 'Read-only backend - settlers interact directly with contract'
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

app.get('/api/rates', async (req, res) => {
  try {
    await rateService.updateRates();
    res.json({
      success: true,
      data: {
        rates: cache.rates,
        lastUpdated: cache.lastRateUpdate,
        platformFeeBps: config.platformFeeBps,
        source: 'CoinGecko API'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/parse-qr', (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) {
      return res.status(400).json({ success: false, error: 'Missing QR data' });
    }

    const merchantData = upiService.parseUPIQR(qrData);
    res.json({ success: true, data: merchantData });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/calculate', async (req, res) => {
  try {
    const { inrAmount, token } = req.body;
    
    if (!inrAmount || !token) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    if (parseFloat(inrAmount) <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    const rate = await rateService.getRate(token);
    if (!rate) {
      return res.status(400).json({ success: false, error: 'Invalid token' });
    }

    const cryptoAmount = parseFloat(inrAmount) / rate;
    
    res.json({
      success: true,
      data: {
        inrAmount: parseFloat(inrAmount).toFixed(2),
        cryptoAmount: cryptoAmount.toFixed(6),
        rate: rate.toFixed(2),
        token
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/validate-upi', (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) {
      return res.status(400).json({ success: false, error: 'Missing UPI ID' });
    }
    
    const isValid = upiService.isValidUPI(upiId);
    res.json({ success: true, data: { upiId, isValid } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/open', async (req, res) => {
  try {
    logger.info('GET /api/orders/open called');
    
    const orders = await orderService.getOpenOrders();
    
    logger.info(`Returning ${orders.length} open orders`);

    const response = {
      success: true,
      data: {
        orders: orders,
        count: orders.length,
        timestamp: new Date().toISOString()
      }
    };
    
    logger.info('Response structure:', JSON.stringify(response, null, 2));
    
    res.json(response);
  } catch (error) {
    logger.error(`Error in /api/orders/open: ${error.message}`);
    logger.error('Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.stack 
    });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    logger.info(`GET /api/orders/${orderId}`);

    const forceRefresh = req.query.refresh === 'true';
    
    if (forceRefresh) {
      logger.info(`Force refresh requested for order ${orderId}`);
      cache.orderCache.delete(`order_${orderId}`);
    }
    
    const order = await orderService.getOrder(orderId);
    logger.info(`Returning order ${orderId}: Status=${order.status} (${order.statusCode})`);
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error(`Error fetching order ${orderId}: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, orderId: req.params.orderId });
  }
});

app.get('/api/orders/user/:address', async (req, res) => {
  try {
    const orders = await orderService.getUserOrders(req.params.address);
    res.json({
      success: true,
      data: {
        orders,
        count: orders.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/settler/:address', async (req, res) => {
  try {
    const orders = await orderService.getSettlerOrders(req.params.address);
    res.json({
      success: true,
      data: {
        orders,
        count: orders.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/settlers/:address/stats', async (req, res) => {
  try {
    const stats = await orderService.getSettlerStats(req.params.address);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/settlers/:address/verified', async (req, res) => {
  try {
    const isVerified = await contract.verifiedSettlers(req.params.address);
    res.json({
      success: true,
      data: {
        address: req.params.address,
        isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tokens/:address/supported', async (req, res) => {
  try {
    const isSupported = await contract.supportedTokens(req.params.address);
    res.json({
      success: true,
      data: {
        token: req.params.address,
        isSupported
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const [platformFee, minAmount, maxAmount, owner] = await Promise.all([
      contract.platformFeeBps(),
      contract.minOrderAmount(),
      contract.maxOrderAmount(),
      contract.owner()
    ]);

    res.json({
      success: true,
      data: {
        contractAddress: config.contractAddress,
        owner,
        platformFeeBps: platformFee.toString(),
        minOrderAmount: ethers.formatUnits(minAmount, 6),
        maxOrderAmount: ethers.formatUnits(maxAmount, 6),
        orderTimeout: '30 minutes',
        settlementTimeout: '15 minutes',
        orderCooldown: '10 seconds',
        maxDailyOrders: 100
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/contract-orders', async (req, res) => {
  try {
    logger.info('DEBUG: Checking contract directly...');
    
    const orderCount = await contract.getOrderCount();
    logger.info(`Total orders: ${orderCount}`);
    
    const openOrderIds = await contract.getOpenOrders();
    logger.info(`Open order IDs: ${openOrderIds.map(id => id.toString())}`);
    
    res.json({
      success: true,
      data: {
        totalOrders: orderCount.toString(),
        openOrderIds: openOrderIds.map(id => id.toString()),
        contractAddress: contract.target
      }
    });
  } catch (error) {
    logger.error('Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

app.post('/api/orders/refresh', async (req, res) => {
  try {
    const orders = await orderService.getOpenOrders(true);
    res.json({
      success: true,
      data: {
        orders,
        count: orders.length,
        message: 'Cache refreshed'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const orderCount = await contract.getOrderCount();
    const openOrders = await orderService.getOpenOrders();
    
    res.json({
      success: true,
      data: {
        totalOrders: orderCount.toString(),
        openOrders: openOrders.length,
        completedOrders: Number(orderCount) - openOrders.length,
        rates: cache.rates,
        lastRateUpdate: new Date(cache.lastRateUpdate).toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  logger.error(`Unhandled error: ${error.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function main() {
  try {
    logger.info(' Starting crypto-offramp Backend (Read-Only)...');

    const orderCount = await contract.getOrderCount();
    const owner = await contract.owner();
    logger.info(` Contract connected - ${orderCount} total orders`);
    logger.info(` Contract owner: ${owner}`);

    await rateService.updateRates();
    setInterval(() => rateService.updateRates(), 60000);

    await startEventMonitoring();

    app.listen(config.port, () => {
      logger.info('='.repeat(60));
      logger.info(` crypto-offramp Backend Running`);
      logger.info('='.repeat(60));
      logger.info(`Port: ${config.port}`);
      logger.info(`Contract: ${config.contractAddress}`);
      logger.info(`Mode: P2P Escrow (Read-Only)`);
      logger.info(`Owner: ${owner}`);
      logger.info('='.repeat(60));
      logger.info('\n Monitoring blockchain events...');
      logger.info('  Backend is READ-ONLY - no private keys needed');
      logger.info('  Settlers interact directly with contract\n');
    });
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

main();

module.exports = app;