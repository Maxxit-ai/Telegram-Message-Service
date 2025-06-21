// server.js
import dotenv from 'dotenv';
// Load dotenv first
dotenv.config();

// Then import other services
import express from 'express';
import CryptoService from '../services/CryptoService.js';
import TelegramService from '../services/TelegramService.js';

const app = express();
const port = process.env.PORT || 3000;
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
    await telegramService.sendMessage(username, message);
    res.json({
      success: true,
      message: 'Telegram message sent successfully'
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
app.listen(port, () => {
  console.log(`Crypto API server running on port ${port}`);
});