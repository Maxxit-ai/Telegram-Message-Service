// server.js
import dotenv from 'dotenv';
// Load dotenv first
dotenv.config();

// Then import other services
import express from 'express';
import CryptoService from '../services/CryptoService.js';
import TelegramService from '../services/TelegramService.js';

const app = express();
const port = process.env.PORT || 3001;
const cryptoService = new CryptoService();
const telegramService = new TelegramService();

app.use(express.json());

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// API Endpoints

// Simple health check endpoint for monitoring
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Get token data by ID
app.get('/api/token/:coinId', asyncHandler(async (req, res) => {
  const { coinId } = req.params;
  const data = await cryptoService.getTokenDataById(coinId);
  res.json({
    success: true,
    data
  });
}));

// Get token data with historical context
app.get('/api/token/:coinId/history', asyncHandler(async (req, res) => {
  const { coinId } = req.params;
  const { historicalTimestamp, currentTimestamp } = req.query;

  if (!historicalTimestamp) {
    return res.status(400).json({
      success: false,
      error: 'Historical timestamp is required'
    });
  }

  try {
    const data = await cryptoService.getTokenDataWithHistory(
      coinId,
      historicalTimestamp,
      currentTimestamp // Optional, defaults to now if not provided
    );
    res.json({
      success: true,
      data
    });
  } catch (error) {
    throw error;
  }
}));

app.get('/api/token/:coinId/price-range', asyncHandler(async (req, res) => {
  const { coinId } = req.params;
  const { startTimestamp, endTimestamp, interval } = req.query;

  if (!startTimestamp || !endTimestamp) {
    return res.status(400).json({
      success: false,
      error: 'Both startTimestamp and endTimestamp are required'
    });
  }

  try {
    const data = await cryptoService.getHighestPriceBetweenDates(
      coinId,
      startTimestamp,
      endTimestamp,
      interval // Optional, defaults to 'daily'
    );
    res.json({
      success: true,
      data
    });
  } catch (error) {
    throw error;
  }
}));

// Add this new endpoint after the existing endpoints
app.get('/api/token/:coinId/price-periods', asyncHandler(async (req, res) => {
  const { coinId } = req.params;
  const { timestamp } = req.query;

  if (!timestamp) {
    return res.status(400).json({
      success: false,
      error: 'Timestamp is required'
    });
  }

  try {
    // Clean the timestamp by replacing "·" with a space
    const cleanTimestamp = timestamp.replace("·", " ");
    const startTime = Date.parse(cleanTimestamp);
    if (isNaN(startTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timestamp format'
      });
    }

    // Fetch 365-day price data from CoinGecko
    const response = await fetch(`https://www.coingecko.com/price_charts/${coinId}/usd/365_days.json`);
    const data = await response.json();
    const priceStats = data.stats; // Array of [timestamp, price]

    // Find the closest price to the given timestamp
    const closestPriceData = priceStats.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev[0] - startTime);
      const currDiff = Math.abs(curr[0] - startTime);
      return currDiff < prevDiff ? curr : prev;
    });
    const priceAtTimestamp = closestPriceData ? Number(closestPriceData[1].toFixed(4)) : null;

    // Get the latest price (last entry in priceStats)
    const latestPriceData = priceStats[priceStats.length - 1];
    const latestPrice = latestPriceData ? Number(latestPriceData[1].toFixed(4)) : null;
    const latestTimestamp = latestPriceData ? new Date(latestPriceData[0]).toISOString() : null;

    // Filter data to only include points after startTime for highest prices
    const futurePrices = priceStats.filter(([ts]) => ts >= startTime);

    if (futurePrices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No price data available after the specified timestamp'
      });
    }

    // Calculate time boundaries (in milliseconds)
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;
    const oneMonthMs = 30 * oneDayMs;

    // Get highest price within 24 hours
    const dayPrices = futurePrices
      .filter(([ts]) => ts <= startTime + oneDayMs)
      .map(([, price]) => price);
    const highestDayPrice = Math.max(...dayPrices);

    // Get highest price for week (excluding first 24 hours)
    const weekPrices = futurePrices
      .filter(([ts]) => ts > startTime + oneDayMs && ts <= startTime + oneWeekMs)
      .map(([, price]) => price);
    const highestWeekPrice = weekPrices.length > 0 ? Math.max(...weekPrices) : null;

    // Get highest price for month (excluding first week)
    const monthPrices = futurePrices
      .filter(([ts]) => ts > startTime + oneWeekMs && ts <= startTime + oneMonthMs)
      .map(([, price]) => price);
    const highestMonthPrice = monthPrices.length > 0 ? Math.max(...monthPrices) : null;

    res.json({
      success: true,
      data: {
        timestamp: new Date(startTime).toISOString(),
        priceAtTimestamp: priceAtTimestamp, // Price at given timestamp
        latestPrice: {
          price: latestPrice, // Price at latest timestamp
          timestamp: latestTimestamp // Corresponding timestamp
        },
        highestPrices: {
          day: highestDayPrice ? Number(highestDayPrice.toFixed(4)) : null,
          week: highestWeekPrice ? Number(highestWeekPrice.toFixed(4)) : null,
          month: highestMonthPrice ? Number(highestMonthPrice.toFixed(4)) : null
        },
        periods: {
          day: {
            start: new Date(startTime).toISOString(),
            end: new Date(startTime + oneDayMs).toISOString(),
            dataPoints: dayPrices.length
          },
          week: {
            start: new Date(startTime + oneDayMs).toISOString(),
            end: new Date(startTime + oneWeekMs).toISOString(),
            dataPoints: weekPrices.length
          },
          month: {
            start: new Date(startTime + oneWeekMs).toISOString(),
            end: new Date(startTime + oneMonthMs).toISOString(),
            dataPoints: monthPrices.length
          }
        }
      }
    });
  } catch (error) {
    throw new Error(`Failed to fetch or process price data: ${error.message}`);
  }
}));

// Get service metrics
app.get('/api/metrics', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      totalRequests: cryptoService.metrics.totalRequests,
      failedRequests: cryptoService.metrics.failedRequests,
      cacheHits: cryptoService.metrics.cacheHits,
      queueStats: cryptoService.metrics.queueStats,
      currentQueue: {
        pending: cryptoService.apiQueue.pending,
        processed: cryptoService.queueStats.processed
      }
    }
  });
}));

// Clear cache
app.post('/api/cache/clear', asyncHandler(async (req, res) => {
  cryptoService.clearCache();
  res.json({
    success: true,
    message: 'Cache cleared successfully'
  });
}));

// Send Telegram message
app.post('/api/telegram/send', asyncHandler(async (req, res) => {
  const { username, message } = req.body;

  if (!username || !message) {
    return res.status(400).json({
      success: false,
      error: 'Both username and message are required'
    });
  }

  try {
    const response = await telegramService.sendMessage(username, message);
    console.log('Telegram message sent successfully', response);
    res.json({
      success: true,
      message: 'Telegram message sent successfully'
    });
  } catch (error) {
    throw error;
  }
}));

// Send test bullish signal message
app.post('/api/telegram/send-test-signal', asyncHandler(async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      success: false,
      error: 'Username is required'
    });
  }

  const testSignalMessage = `🚀 **Bullish Alert** 🚀

🏛️ **Token**: PEPE (pepe)
📈 **Signal**: Buy
💰 **Entry Price**: $0.003
🎯 **Targets**:
TP1: $0.0034
TP2: $0.0036
🛑 **Stop Loss**: $0.0028
⏳ **Timeline:** Short-term (1-7 days)

💡 **Trade Tip**:
Falling wedge breakout signaled with high volume, suggesting potential bullish reversal. Entry at current dip with tight stop-loss. Monitor volume sustainability and retest of wedge resistance. Risk management crucial amid recent 12.4% drop.`;

  try {
    const response = await telegramService.sendMessage(username, testSignalMessage);
    console.log('Test bullish signal message sent successfully', response);
    res.json({
      success: true,
      message: 'Test bullish signal sent successfully with Simulate Trade button'
    });
  } catch (error) {
    throw error;
  }
}));

// Get simulation data
app.get('/api/simulations', asyncHandler(async (req, res) => {
  const { username, limit = 10, status } = req.query;

  try {
    const client = await dbConnect();
    const db = client.db("ctxbt-signal-flow");
    const simulationCollection = db.collection("trade_simulations");

    // Build query
    const query = {};
    if (username) {
      query.username = username;
    }
    if (status) {
      query.status = status;
    }

    // Get simulations with limit
    const simulations = await simulationCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({
      success: true,
      data: {
        simulations,
        count: simulations.length,
        query: { username, limit, status }
      }
    });
  } catch (error) {
    throw error;
  }
}));

// Get simulation by ID
app.get('/api/simulations/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const client = await dbConnect();
    const db = client.db("ctxbt-signal-flow");
    const simulationCollection = db.collection("trade_simulations");

    const simulation = await simulationCollection.findOne({ _id: id });

    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: 'Simulation not found'
      });
    }

    res.json({
      success: true,
      data: simulation
    });
  } catch (error) {
    throw error;
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start server
app.listen(port, async () => {
  console.log(`Crypto API server running on port ${port}`);

  // Start the Telegram bot
  try {
    await telegramService.startBot();
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    await telegramService.stopBot();
  } catch (error) {
    console.error('Error stopping Telegram bot:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  try {
    await telegramService.stopBot();
  } catch (error) {
    console.error('Error stopping Telegram bot:', error);
  }
  process.exit(0);
});