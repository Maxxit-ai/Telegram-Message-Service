// test-telegram.js
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testTelegramBot() {
  try {
    // Test 1: Send a regular message (should not have button)
    console.log('Testing regular message...');
    const regularResponse = await fetch(`${API_BASE}/telegram/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'meetpaladiya4436', // Replace with actual username
        message: `🐻 **Bearish Warning** 🐻

        🏛️ **Token**: OM (mantra-dao)
        📈 **Signal**: Sell
        💰 **Entry Price**: $0.6736
        🎯 **Targets**:
        TP1: $0.6
        TP2: $0.55
        🛑 **Stop Loss**: $0.72
        ⏳ **Timeline:** Short-term (1-3 days)
        
        💡 **Trade Tip**:
        OM shows bearish momentum with 8.17% price drop and surging $2B volume. Tweet sentiment aligns with technical weakness. High liquidation risks and CEX scrutiny suggest further downside. Implement strict stop-loss to limit exposure to volatility.`
      })
    });
    
    const regularResult = await regularResponse.json();
    console.log('Regular message result:', regularResult);

    // Test 2: Send a bullish signal message (should have Simulate Trade button)
    console.log('\nTesting bullish signal message...');
    const signalResponse = await fetch(`${API_BASE}/telegram/send-test-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'meetpaladiya4436' // Replace with actual username
      })
    });
    
    const signalResult = await signalResponse.json();
    console.log('Signal message result:', signalResult);

    // Test 3: Get simulation data (after button click)
    console.log('\nTesting simulation data retrieval...');
    const simulationsResponse = await fetch(`${API_BASE}/simulations?username=meetpaladiya4436&limit=5`);
    const simulationsResult = await simulationsResponse.json();
    console.log('Simulations result:', simulationsResult);

    // Test 4: Get specific simulation by ID (if any exist)
    if (simulationsResult.data && simulationsResult.data.simulations.length > 0) {
      const firstSimulation = simulationsResult.data.simulations[0];
      console.log('\nTesting specific simulation retrieval...');
      const specificResponse = await fetch(`${API_BASE}/simulations/${firstSimulation._id}`);
      const specificResult = await specificResponse.json();
      console.log('Specific simulation result:', specificResult);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testTelegramBot();
