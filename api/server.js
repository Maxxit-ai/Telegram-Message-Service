// server.js
import dotenv from 'dotenv';
// Load dotenv first
dotenv.config();

// Then import other services
import express from 'express';
import TelegramService from '../services/TelegramService.js';

const app = express();
const port = process.env.PORT || 3001;
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

🏛️ **Token**:  UNI (uniswap)
📈 **Signal**: Buy
💰 **Entry Price**: $9.37
🎯 **Targets**:
TP1: $11.37
TP2: $13.37
🛑 **Stop Loss**: $8.37
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