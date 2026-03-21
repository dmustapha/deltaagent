// File: src/index.ts

import { config } from './config.js';
import { initWdk, getWalletAddress } from './wdk-setup.js';
import { start, stop } from './agent-loop.js';
import { logStartup, logError } from './logger.js';

async function main(): Promise<void> {
  try {
    // 1. Initialize WDK
    console.log('Initializing WDK...');
    const wdk = await initWdk();
    const walletAddress = await getWalletAddress(wdk);
    logStartup(walletAddress, config.rpcUrl);

    // 2. Register shutdown handlers
    const shutdown = () => {
      console.log('\nShutting down gracefully...');
      stop();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 3. Start agent loop
    console.log(`Agent starting with ${config.agent.cycleIntervalMs / 1000}s cycle interval...`);
    console.log(`Max leverage: ${config.agent.maxLeverage}x | Min health: ${config.agent.minHealthFactor}`);
    console.log(`Mock LLM: ${config.useMockLlm ? 'ON (saving Groq tokens)' : 'OFF (real Groq calls)'}\n`);

    await start(wdk);
  } catch (error) {
    logError(error, 'main');
    process.exit(1);
  }
}

main();
