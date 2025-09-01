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

        // Store the comprehensive data in database
        await this.handleSimulateTradeRequest(userData);

        // Acknowledge the callback query
        await ctx.answerCbQuery('Trade simulation initiated! 🚀');

        // Send confirmation message
        await ctx.reply('✅ Trade simulation has been initiated for this signal. You will receive updates shortly.');

      } catch (error) {
        console.error('Error handling simulate trade callback:', error);
        await ctx.answerCbQuery('❌ Error processing simulation request');
      }
    });

    // Handle unknown callback queries
    this.bot.action(/.*/, (ctx) => {
      ctx.answerCbQuery('Unknown action');
    });
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

      await simulationCollection.insertOne(simulationRecord);
      console.log('Simulation request stored with ID:', simulationRecord._id);

      // Here you can add additional logic for trade simulation
      // For example, parsing the signal message and creating a simulated trade

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
      const usersCollection = db.collection("users_telegram_signal_simulation_testing");

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