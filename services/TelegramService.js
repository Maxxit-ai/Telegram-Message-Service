import { Telegraf } from 'telegraf';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import dbConnect from '../utils/dbConnect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

dotenv.config({ path: envPath });

// Add these debug lines
console.log('Environment variables:', {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
});

class TelegramService {
  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }

    // Initialize both Telegraf and axios for backward compatibility
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.apiUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    this.setupBotHandlers();
  }

  /**
   * Setup bot handlers for commands and callbacks
   */
  setupBotHandlers() {
    // Handle /start command
    this.bot.command('start', (ctx) => {
      ctx.reply('Welcome! I\'m your crypto signal bot. I\'ll send you trading signals with simulation options.');
    });

    // Handle callback queries (button clicks)
    this.bot.action(/simulate_trade_(.+)/, async (ctx) => {
      try {
        // Extract all available data from the callback context
        const callbackData = ctx.match[1];
        // Extract comprehensive user and action data
        const userData = {
          // User identification
          username: ctx.from.username,

          // Chat information
          chatId: ctx.chat?.id,
          chatType: ctx.chat?.type, // 'private', 'group', 'supergroup', 'channel'
          chatUsername: ctx.chat?.username,

          // Message information
          messageId: ctx.callbackQuery.message.message_id,
          messageText: ctx.callbackQuery.message.text,
          messageDate: ctx.callbackQuery.message.date,

          // Callback query information
          callbackQueryId: ctx.callbackQuery.id,
          callbackData: callbackData,
          callbackQueryFrom: ctx.callbackQuery.from,

          // Additional context
          chatInstance: ctx.callbackQuery.chat_instance,

          // Timestamps
          callbackTimestamp: new Date(),
          messageTimestamp: ctx.callbackQuery.message.date ? new Date(ctx.callbackQuery.message.date * 1000) : null
        };

        console.log('Comprehensive user and action data captured:', {
          userId: userData.userId,
          username: userData.username,
          chatId: userData.chatId,
          messageId: userData.messageId,
          callbackData: userData.callbackData,
          messageText: userData.messageText.substring(0, 100) + '...' // Log first 100 chars
        });

        // Answer callback query immediately to acknowledge user interaction
        await ctx.answerCbQuery('🔄 Processing trade simulation...');

        // Send initial processing message for better UX
        const processingMessage = await ctx.reply('⏳ **Processing Trade Simulation...**\n\n' +
          '🔄 Connecting to trading engine...\n' +
          '📊 Analyzing signal data...\n' +
          '⚡ Executing simulation...\n\n' +
          '*This may take a few moments...*');

        // Optional: Update progress every 5 seconds for better UX
        const progressInterval = setInterval(async () => {
          try {
            const dots = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
            const randomDot = dots[Math.floor(Math.random() * dots.length)];
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              processingMessage.message_id,
              null,
              `${randomDot} **Processing Trade Simulation...**\n\n` +
              '🔄 Connecting to trading engine...\n' +
              '📊 Analyzing signal data...\n' +
              '⚡ Executing simulation...\n\n' +
              '*Please wait while we process your request...*',
              { parse_mode: 'Markdown' }
            );
          } catch (editError) {
            // Message might be too old to edit, just continue
            console.log('Could not update progress, continuing...');
          }
        }, 3000); // Update every 3 seconds

        try {
          // Store the comprehensive data in database and get API response
          const apiResponse = await this.handleSimulateTradeRequest(userData);
          console.log("apiResponse", apiResponse);

          // Clear the progress interval once we have the response
          clearInterval(progressInterval);

          // Format reply message based on API response
          let replyMessage = '';
          if (apiResponse && apiResponse.status === 'success') {
            // Escape underscores in IDs to prevent Markdown parsing errors
            const safeAddress = (apiResponse.result?.tradingPair?.safeAddress || 'N/A').replace(/_/g, '\\_');
            const tradeId = (apiResponse.result?.tradingPair?.tradeId || 'N/A').replace(/_/g, '\\_');

            replyMessage = `✅ **Trade Simulation Successful!**\n\n` +
              `🔹 **Signal ID**: \`${apiResponse.signalId}\`\n` +
              `🔹 **Network**: ${apiResponse.result?.tradingPair?.networkKey || 'N/A'}\n` +
              `🔹 **Safe Address**: \`${safeAddress}\`\n` +
              `🔹 **Trade ID**: \`${tradeId}\`\n` +
              `🔹 **Status**: ${apiResponse.result?.tradingPair?.status || 'N/A'}\n\n` +
              `🚀 Your trade simulation has been processed successfully!`;
          } else if (apiResponse && apiResponse.status === 'failed') {
            const errorMsg = (apiResponse.result?.error || apiResponse.result?.tradingPair?.error || 'Unknown error').replace(/_/g, '\\_');
            replyMessage = `❌ **Trade Simulation Failed**\n\n` +
              `🔹 **Signal ID**: \`${apiResponse.signalId}\`\n` +
              `🔹 **Network**: ${apiResponse.result?.tradingPair?.networkKey || 'N/A'}\n` +
              `🔹 **Error**: \`${errorMsg}\`\n\n` +
              `Please try again or contact support if the issue persists.`;
          } else {
            // Fallback for unexpected response format
            replyMessage = '✅ Trade simulation has been initiated for this signal. You will receive updates shortly.';
          }

          // Edit the processing message with the final result
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            null,
            replyMessage,
            { parse_mode: 'Markdown' }
          );

        } catch (error) {
          console.error('Error handling simulate trade callback:', error);

          // Clear the progress interval on error
          clearInterval(progressInterval);

          // Try to answer callback query, but don't fail if it's expired
          try {
            await ctx.answerCbQuery('❌ Error processing simulation request');
          } catch (cbError) {
            console.log('Callback query already expired, skipping answerCbQuery');
          }

          // Try to edit the processing message with error, fallback to reply if edit fails
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              processingMessage.message_id,
              null,
              '❌ Sorry, there was an error processing your trade simulation. Please try again later.',
              { parse_mode: 'Markdown' }
            );
          } catch (editError) {
            console.log('Could not edit processing message, sending new reply');
            await ctx.reply('❌ Sorry, there was an error processing your trade simulation. Please try again later.');
          }
        }
      } catch (error) {
        console.error('Error handling simulate trade callback:', error);

        // Try to answer callback query, but don't fail if it's expired
        try {
          await ctx.answerCbQuery('❌ Error processing simulation request');
        } catch (cbError) {
          console.log('Callback query already expired, skipping answerCbQuery');
        }

        await ctx.reply('❌ Sorry, there was an error processing your trade simulation. Please try again later.');
      }
    });

    // Handle unknown callback queries
    this.bot.action(/.*/, (ctx) => {
      ctx.answerCbQuery('Unknown action');
    });
  }

  /**
   * Parse trading signal data from message text
   * @param {string} message - The message text containing trading signal
   * @returns {object} Parsed trading data
   */
  parseSignalMessage(message) {
    const parsePrice = (priceStr) => {
      if (!priceStr) return null;
      const match = priceStr.match(/\$?(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : null;
    };

    // Extract token (uppercase token before parentheses)
    const tokenMatch = message.match(/🏛️ Token:\s*([A-Z]+)\s*\(/);
    const token = tokenMatch ? tokenMatch[1] : null;

    // Extract TP1
    const tp1Match = message.match(/TP1:\s*\$?(\d+\.?\d*)/);
    const tp1 = tp1Match ? parseFloat(tp1Match[1]) : null;

    // Extract TP2
    const tp2Match = message.match(/TP2:\s*\$?(\d+\.?\d*)/);
    const tp2 = tp2Match ? parseFloat(tp2Match[1]) : null;

    // Extract Stop Loss
    const slMatch = message.match(/🛑 Stop Loss:\s*\$?(\d+\.?\d*)/);
    const sl = slMatch ? parseFloat(slMatch[1]) : null;

    // Extract Entry Price
    const entryMatch = message.match(/💰 Entry Price:\s*\$?(\d+\.?\d*)/);
    const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : null;

    return {
      token,
      tp1,
      tp2,
      sl,
      entryPrice
    };
  }

  /**
   * Fetch user data and safe address from databases
   * @param {string} telegramUsername - The telegram username
   * @returns {Promise<object>} Object containing twitterId and safeAddress
   */
  async fetchUserData(telegramUsername) {
    try {
      const client = await dbConnect();

      // First, find user in ctxbt-signal-flow database
      const ctxbtDb = client.db("ctxbt-signal-flow");
      const usersCollection = ctxbtDb.collection("users");

      const user = await usersCollection.findOne({ telegramId: telegramUsername });
      if (!user || !user.twitterId) {
        throw new Error(`User not found or twitterId not available for telegram username: ${telegramUsername}`);
      }

      const twitterId = user.twitterId;

      // Second, find safe in safe-deployment-service database
      const safeDb = client.db("safe-deployment-service");
      const safesCollection = safeDb.collection("safes");
      console.log("twitterId", twitterId);
      const safe = await safesCollection.findOne({ "userInfo.userId": twitterId });
      console.log("safe", safe);
      if (!safe || !safe.deployments?.arbitrum?.address) {
        throw new Error(`Safe not found or arbitrum address not available for twitterId: ${twitterId}`);
      }

      const safeAddress = safe.deployments.arbitrum.address;

      return {
        username: twitterId,
        safeAddress
      };

    } catch (error) {
      console.error('Error fetching user data:', error);
      throw error;
    }
  }

  /**
   * Simulate trade by calling the signal processing API
   * @param {object} signalData - Parsed signal data
   * @param {string} username - Twitter ID
   * @param {string} safeAddress - Safe address
   * @returns {Promise<object>} API response
   */
  async simulateTrade(signalData, username, safeAddress) {
    try {
      // Calculate current price as average of TP1 and SL if available
      const currentPrice = signalData.entryPrice ||
        (signalData.tp1 && signalData.sl ? (signalData.tp1 + signalData.sl) / 2 : null);

      // Calculate max exit time as next day from current date
      const maxExitTime = new Date();
      maxExitTime.setDate(maxExitTime.getDate() + 1);

      const apiBody = {
        "Signal Message": "buy",
        "Token Mentioned": signalData.token,
        "TP1": signalData.tp1,
        "TP2": signalData.tp2,
        "SL": signalData.sl,
        "Current Price": currentPrice,
        "Max Exit Time": { "$date": maxExitTime },
        "username": username,
        "safeAddress": safeAddress
      };

      console.log('Calling signal processing API with body:', apiBody);

      // const response = await axios.post('https://safetrading.maxxit.ai/api/signal/process', apiBody, {
      const response = await axios.post('http://localhost:3006/api/signal/process', apiBody, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // const response = {
      //   data: {
      //     status: 'success',
      //     signalId: '1234567890',
      //     result: {
      //       tradingPair: {
      //         networkKey: 'arbitrum',
      //         safeAddress: safeAddress,
      //         tradeId: '1234567890',
      //         status: 'initiated'
      //       }
      //     }
      //   }
      // }

      console.log('Signal processing API response:', response.data);
      return response.data;

    } catch (error) {
      console.error('Error calling signal processing API:', error);
      throw error;
    }
  }

  /**
   * Handle simulate trade request with comprehensive user and action data
   */
  async handleSimulateTradeRequest(userData) {
    try {
      const client = await dbConnect();
      const db = client.db("ctxbt-signal-flow");
      const simulationCollection = db.collection("trade_simulations");

      // Create simulation record based on simplified userData structure
      const simulationRecord = {
        // Basic simulation info
        status: 'initiated',
        timestamp: new Date(),

        // User identification
        username: userData.username,

        // Chat information
        chatId: userData.chatId,
        chatType: userData.chatType,
        chatUsername: userData.chatUsername,

        // Message information
        messageId: userData.messageId,
        messageText: userData.messageText,
        messageDate: userData.messageDate,

        // Callback query information
        callbackQueryId: userData.callbackQueryId,
        callbackData: userData.callbackData,
        callbackQueryFrom: userData.callbackQueryFrom,

        // Additional context
        chatInstance: userData.chatInstance,

        // Timestamps
        callbackTimestamp: userData.callbackTimestamp,
        messageTimestamp: userData.messageTimestamp
      };

      // Parse signal message to extract trading data
      const signalData = this.parseSignalMessage(userData.messageText);
      console.log('Parsed signal data:', signalData);

      // Fetch user data and safe address
      const userDataResult = await this.fetchUserData(userData.username);
      console.log('Fetched user data:', userDataResult);

      // Simulate trade by calling the API
      const apiResponse = await this.simulateTrade(signalData, userDataResult.username, userDataResult.safeAddress);

      // Add API response to simulation record
      simulationRecord.apiResponse = apiResponse;
      simulationRecord.signalData = signalData;
      simulationRecord.twitterId = userDataResult.username;
      simulationRecord.safeAddress = userDataResult.safeAddress;

      console.log('Simulation record:', simulationRecord);
      await simulationCollection.insertOne(simulationRecord);
      console.log('Simulation request stored with ID:', simulationRecord._id);

      // Return the API response for the callback handler to use
      return apiResponse;

    } catch (error) {
      console.error('Error storing comprehensive simulation request:', error);
      throw error;
    }
  }

  /**
   * Find chat ID for a given username from the database
   * @param {string} username - Telegram username to find
   * @returns {Promise<string|null>} The chat ID if found
   */
  async findChatIdByUsername(username) {
    try {
      const client = await dbConnect();
      const db = client.db("ctxbt-signal-flow");
      const usersCollection = db.collection("users");

      // Find user by telegram username
      const user = await usersCollection.findOne({ telegramId: username });

      if (!user || !user.chatId) {
        throw new Error('User not found or chat ID not available in database.');
      }

      return user.chatId;
    } catch (error) {
      console.error('Error finding chat ID:', error);
      throw error;
    }
  }

  /**
   * Check if message contains bullish signal
   * @param {string} message - The message to check
   * @returns {boolean} True if bullish signal detected
   */
  isBullishSignal(message) {
    return message.includes('🚀 **Bullish Alert** 🚀') || message.includes('📈 **Signal**: Buy');
  }

  /**
   * Sends a message to a Telegram user with optional inline keyboard
   * @param {string} username - The Telegram username
   * @param {string} message - The message content to send
   * @returns {Promise} Response from Telegram API (maintains backward compatibility)
   */
  async sendMessage(username, message) {
    try {
      // Remove @ if present
      const cleanUsername = username.replace('@', '');

      // Find chat ID from database
      const chatId = await this.findChatIdByUsername(cleanUsername);

      // Check if this is a bullish signal
      const isBullish = this.isBullishSignal(message);

      if (isBullish) {
        // Use Telegraf for messages with buttons (new functionality)
        const keyboard = {
          inline_keyboard: [
            [{
              text: '🚀 Simulate Trade',
              callback_data: `simulate_trade_${Date.now()}_${cleanUsername}`
            }]
          ]
        };

        const response = await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });

        // Convert Telegraf response to match axios response format for backward compatibility
        return {
          ok: true,
          result: response,
          description: 'Message sent successfully with inline keyboard'
        };
      } else {
        // Use axios for regular messages (maintains backward compatibility)
        const response = await axios.post(`${this.apiUrl}/sendMessage`, {
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        });

        if (!response.data.ok) {
          throw new Error(`Telegram API Error: ${response.data.description}`);
        }

        return response.data; // Return the original axios response format
      }
    } catch (error) {
      console.error('Full error:', error);
      if (error.response) {
        throw new Error(`Telegram API Error: ${error.response.data.description}`);
      }
      throw error;
    }
  }

  /**
   * Get updates from the bot (maintains backward compatibility)
   */
  async getUpdates() {
    try {
      // Use axios to maintain backward compatibility
      const response = await axios.get(`${this.apiUrl}/getUpdates`);
      return response.data;
    } catch (error) {
      console.error('Error getting updates:', error);
      throw error;
    }
  }

  /**
   * Start the bot (call this after setting up handlers)
   */
  async startBot() {
    try {
      await this.bot.launch();
      console.log('Telegram bot started successfully');
    } catch (error) {
      console.error('Error starting bot:', error);
      throw error;
    }
  }

  /**
   * Stop the bot gracefully
   */
  async stopBot() {
    try {
      await this.bot.stop('SIGTERM');
      console.log('Telegram bot stopped gracefully');
    } catch (error) {
      console.error('Error stopping bot:', error);
      throw error;
    }
  }
}

export default TelegramService; 