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
    this.apiUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
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
   * Sends a message to a Telegram user
   * @param {string} username - The Telegram username
   * @param {string} message - The message content to send
   * @returns {Promise} Response from Telegram API
   */
  async sendMessage(username, message) {
    try {
      // Remove @ if present
      const cleanUsername = username.replace('@', '');
      
      // Find chat ID from updates
      const chatId = await this.findChatIdByUsername(cleanUsername);
      
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      });

      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data;
    } catch (error) {
      console.error('Full error:', error.response?.data || error);
      if (error.response) {
        throw new Error(`Telegram API Error: ${error.response.data.description}`);
      }
      throw error;
    }
  }

  /**
   * Get updates from the bot
   */
  async getUpdates() {
    try {
      const response = await axios.get(`${this.apiUrl}/getUpdates`);
      return response.data;
    } catch (error) {
      console.error('Error getting updates:', error);
      throw error;
    }
  }
}

export default TelegramService; 