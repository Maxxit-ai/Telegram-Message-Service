# Crypto Signal Telegram Bot

This project includes a Telegram bot that sends crypto trading signals with interactive "Simulate Trade" buttons for bullish signals.

## Features

- **Automatic Signal Detection**: Detects bullish signals in messages containing "🚀 **Bullish Alert** 🚀" or "📈 **Signal**: Buy"
- **Interactive Buttons**: Adds "🚀 Simulate Trade" button to bullish signal messages
- **Callback Handling**: Captures button clicks and stores simulation requests
- **Database Integration**: Stores simulation requests in MongoDB

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file in the root directory:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   PORT=3001
   ```

3. **Start the Server**:
   ```bash
   npm start
   ```

## API Endpoints

### Send Regular Message
```bash
POST /api/telegram/send
Content-Type: application/json

{
  "username": "telegram_username",
  "message": "Your message here"
}
```

### Send Test Bullish Signal
```bash
POST /api/telegram/send-test-signal
Content-Type: application/json

{
  "username": "telegram_username"
}
```

## How It Works

1. **Message Detection**: When sending a message, the bot checks if it contains bullish signal indicators
2. **Button Addition**: If bullish signal is detected, a "🚀 Simulate Trade" button is automatically added
3. **Button Click Handling**: When users click the button, the bot captures:
   - `chatId`: User's chat ID
   - `messageId`: ID of the message with the button
   - `username`: User's Telegram username
   - `messageText`: Complete original message
   - `callbackData`: Additional data from the button

4. **Database Storage**: Simulation requests are stored in the `trade_simulations` collection

## Database Schema

### trade_simulations Collection
```javascript
{
  chatId: "string",           // User's chat ID
  messageId: number,          // Message ID where button was clicked
  username: "string",         // User's Telegram username
  originalMessage: "string",  // Complete original message
  callbackData: "string",     // Additional callback data
  timestamp: Date,            // When the simulation was requested
  status: "string"            // Current status (initiated, processing, completed, etc.)
}
```

## Testing

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Run the test script** (update username in the script first):
   ```bash
   node test-telegram.js
   ```

3. **Manual Testing**:
   - Send a regular message: Should appear without any button
   - Send a bullish signal: Should appear with "🚀 Simulate Trade" button
   - Click the button: Should show confirmation and store in database

## Bot Commands

- `/start` - Welcome message and bot introduction

## Error Handling

- Graceful shutdown on SIGTERM/SIGINT
- Error logging for all operations
- Callback query acknowledgments
- Database connection error handling

## Security Notes

- Bot token should be kept secure
- Database connections use proper authentication
- Input validation on all endpoints
- Error messages don't expose sensitive information
