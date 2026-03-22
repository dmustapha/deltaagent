// File: src/index.ts

import { config } from './config.js';
import { initWdk, getWalletAddress } from './wdk-setup.js';
import { start, stop } from './agent-loop.js';
import { logStartup, logError } from './logger.js';
import { startApiServer } from './api-server.js';
import { initStateCollector } from './state-collector.js';

async function main(): Promise<void> {
  try {
    // 1. Initialize WDK
    console.log('Initializing WDK...');
    const wdk = await initWdk();
    const walletAddress = await getWalletAddress(wdk);
    logStartup(walletAddress, config.rpcUrl);

    // Init state collector with wallet address (caches it for API)
    initStateCollector(walletAddress);

    // 2. Startup health check — verify external dependencies before entering loop
    console.log('Running startup health checks...');
    const healthChecks: { name: string; check: () => Promise<void> }[] = [
      {
        name: 'RPC',
        check: async () => {
          const res = await fetch(config.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          });
          if (!res.ok) throw new Error(`RPC returned ${res.status}`);
          const json = (await res.json()) as { result?: string; error?: { message: string } };
          if (json.error) throw new Error(json.error.message);
          console.log(`  ✓ RPC: block ${parseInt(json.result ?? '0x0', 16)}`);
        },
      },
      {
        name: 'Fear & Greed API',
        check: async () => {
          const res = await fetch('https://api.alternative.me/fng/');
          if (!res.ok) throw new Error(`API returned ${res.status}`);
          console.log('  ✓ Fear & Greed API: reachable');
        },
      },
    ];
    if (!config.useMockLlm) {
      healthChecks.push({
        name: 'Groq API',
        check: async () => {
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${config.groqApiKey}` },
          });
          if (!res.ok) throw new Error(`Groq API returned ${res.status}`);
          console.log('  ✓ Groq API: authenticated');
        },
      });
    }
    const critical = new Set(['RPC']);
    for (const { name, check } of healthChecks) {
      try {
        await check();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${name}: ${msg}`);
        if (critical.has(name)) {
          throw new Error(`Startup health check failed: ${name} — ${msg}`);
        }
        console.warn(`  ⚠ ${name} unavailable — will use fallback values`);
      }
    }
    console.log('All health checks passed.\n');

    // 3. Register shutdown handlers
    const shutdown = () => {
      console.log('\nShutting down gracefully...');
      stop();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 4. Start agent loop
    console.log(`Agent starting with ${config.agent.cycleIntervalMs / 1000}s cycle interval...`);
    console.log(`Max leverage: ${config.agent.maxLeverage}x | Min health: ${config.agent.minHealthFactor}`);
    console.log(`Mock LLM: ${config.useMockLlm ? 'ON (saving Groq tokens)' : 'OFF (real Groq calls)'}\n`);

    // Start dashboard API server
    startApiServer(parseInt(process.env.PORT || '3001', 10));

    await start(wdk);
  } catch (error) {
    logError(error, 'main');
    process.exit(1);
  }
}

main();
