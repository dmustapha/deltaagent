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

function safeParseFloat(value: string, fallback: number, name: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    console.warn(`[Config] ${name} parsed as NaN from "${value}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

function safeParseInt(value: string, fallback: number, name: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`[Config] ${name} parsed as NaN from "${value}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

const agentConfig: AgentConfig = {
  cycleIntervalMs: safeParseInt(optionalEnv('CYCLE_INTERVAL_MS', '8000'), 8000, 'CYCLE_INTERVAL_MS'),
  maxLeverage: safeParseFloat(optionalEnv('MAX_LEVERAGE', '3.0'), 3.0, 'MAX_LEVERAGE'),
  minHealthFactor: safeParseFloat(optionalEnv('MIN_HEALTH_FACTOR', '1.3'), 1.3, 'MIN_HEALTH_FACTOR'),
  minConfidence: safeParseFloat(optionalEnv('MIN_CONFIDENCE', '0.6'), 0.6, 'MIN_CONFIDENCE'),
  initialCollateralWei: BigInt(optionalEnv('INITIAL_COLLATERAL_WEI', '5000000000000000000')), // 5 WETH
  profitDisbursePct: safeParseFloat(optionalEnv('PROFIT_DISBURSE_PCT', '0.10'), 0.10, 'PROFIT_DISBURSE_PCT'),
  treasuryAddress: optionalEnv('TREASURY_ADDRESS', '0x000000000000000000000000000000000000dEaD'),
  maxCycles: safeParseInt(optionalEnv('MAX_CYCLES', '100'), 100, 'MAX_CYCLES'),
  volatilityLimit: safeParseFloat(optionalEnv('VOLATILITY_LIMIT', '0.6'), 0.6, 'VOLATILITY_LIMIT'),
  rebalanceThreshold: safeParseFloat(optionalEnv('REBALANCE_THRESHOLD', '15'), 15, 'REBALANCE_THRESHOLD'),
  autoRebalance: optionalEnv('AUTO_REBALANCE', 'true') === 'true',
  emergencyExit: optionalEnv('EMERGENCY_EXIT', 'false') === 'true',
};

// Store seed phrase in a mutable variable — cleared after WDK init to prevent leaking via exports
let _seedPhrase = requireEnv('SEED_PHRASE');

export const config: AppConfig = {
  rpcUrl: optionalEnv('RPC_URL', 'http://localhost:8545'),
  groqApiKey: requireEnv('GROQ_API_KEY'),
  get seedPhrase(): string { return _seedPhrase; },
  chainId: safeParseInt(optionalEnv('CHAIN_ID', '42161'), 42161, 'CHAIN_ID'),
  useMockLlm: optionalEnv('USE_MOCK_LLM', 'false') === 'true',
  addresses: {
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aaveDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdt0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    gmxVaultWhale: '0x489ee077994B6658eAfA855C308275EAd8097C4A',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  agent: agentConfig,
};

/** Clear seed phrase from memory after WDK initialization. */
export function clearSeedPhrase(): void {
  _seedPhrase = '';
}

interface ConfigUpdate {
  maxLeverage?: number;
  minHealthFactor?: number;
  cycleIntervalMs?: number;
  useMockLlm?: boolean;
  volatilityLimit?: number;
  rebalanceThreshold?: number;
  autoRebalance?: boolean;
  emergencyExit?: boolean;
}

export function updateConfig(partial: ConfigUpdate): { success: boolean; config: typeof config.agent; error?: string } {
  const errors: string[] = [];

  if (partial.maxLeverage !== undefined) {
    if (partial.maxLeverage < 1.0 || partial.maxLeverage > 3.0) errors.push('maxLeverage must be 1.0-3.0');
    else (config.agent as any).maxLeverage = partial.maxLeverage;
  }
  if (partial.minHealthFactor !== undefined) {
    if (partial.minHealthFactor < 1.0 || partial.minHealthFactor > 2.0) errors.push('minHealthFactor must be 1.0-2.0');
    else (config.agent as any).minHealthFactor = partial.minHealthFactor;
  }
  if (partial.cycleIntervalMs !== undefined) {
    if (partial.cycleIntervalMs < 5000 || partial.cycleIntervalMs > 60000) errors.push('cycleIntervalMs must be 5000-60000');
    else (config.agent as any).cycleIntervalMs = partial.cycleIntervalMs;
  }
  if (partial.useMockLlm !== undefined) {
    (config as any).useMockLlm = partial.useMockLlm;
  }
  if (partial.volatilityLimit !== undefined) {
    if (partial.volatilityLimit < 0.1 || partial.volatilityLimit > 1.5) errors.push('volatilityLimit must be 0.1-1.5');
    else (config.agent as any).volatilityLimit = partial.volatilityLimit;
  }
  if (partial.rebalanceThreshold !== undefined) {
    const rounded = Math.round(partial.rebalanceThreshold);
    if (rounded < 5 || rounded > 40) errors.push('rebalanceThreshold must be 5-40');
    else (config.agent as any).rebalanceThreshold = rounded;
  }
  if (partial.autoRebalance !== undefined) {
    (config.agent as any).autoRebalance = partial.autoRebalance;
  }
  if (partial.emergencyExit !== undefined) {
    (config.agent as any).emergencyExit = partial.emergencyExit;
  }

  if (errors.length > 0) return { success: false, config: config.agent, error: errors.join('; ') };
  return { success: true, config: config.agent };
}
