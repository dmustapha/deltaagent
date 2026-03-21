// File: src/config.ts

import dotenv from 'dotenv';
import type { AppConfig, AgentConfig } from './types.js';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    console.error('Copy .env.example to .env and fill in all required values.');
    process.exit(1);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

const agentConfig: AgentConfig = {
  cycleIntervalMs: parseInt(optionalEnv('CYCLE_INTERVAL_MS', '8000'), 10),
  maxLeverage: parseFloat(optionalEnv('MAX_LEVERAGE', '3.0')),
  minHealthFactor: parseFloat(optionalEnv('MIN_HEALTH_FACTOR', '1.3')),
  minConfidence: parseFloat(optionalEnv('MIN_CONFIDENCE', '0.6')),
  initialCollateralWei: BigInt(optionalEnv('INITIAL_COLLATERAL_WEI', '5000000000000000000')), // 5 WETH
  profitDisbursePct: parseFloat(optionalEnv('PROFIT_DISBURSE_PCT', '0.10')),
  treasuryAddress: optionalEnv('TREASURY_ADDRESS', '0x000000000000000000000000000000000000dEaD'),
  maxCycles: parseInt(optionalEnv('MAX_CYCLES', '100'), 10),
};

export const config: AppConfig = {
  rpcUrl: optionalEnv('RPC_URL', 'http://localhost:8545'),
  groqApiKey: requireEnv('GROQ_API_KEY'),
  seedPhrase: requireEnv('SEED_PHRASE'),
  chainId: parseInt(optionalEnv('CHAIN_ID', '42161'), 10),
  useMockLlm: optionalEnv('USE_MOCK_LLM', 'false') === 'true',
  addresses: {
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aaveDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdt0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    gmxVaultWhale: '0x489ee077994B6658eAfA855C308275EAd8097C4A',
  },
  agent: agentConfig,
};
