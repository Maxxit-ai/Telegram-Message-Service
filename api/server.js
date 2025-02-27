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