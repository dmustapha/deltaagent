// File: src/signal-aggregator.ts

import type {
  MarketSignals,
  PriceSignal,
  AaveRatesSignal,
  HealthSignal,
  SentimentSignal,
  TvlSignal,
  VolatilitySignal,
  WdkAccountData,
} from './types.js';
import { config } from './config.js';
import {
  computeSMA,
  computeRSI,
  computeVolatility,
  detectTrend,
  healthFactorToNumber,
  rayToPercent,
  ethCall,
  padAddress,
  parseUint256,
} from './utils.js';
import { getAaveLending, getPricingClient } from './wdk-setup.js';
import type WDK from '@tetherto/wdk';

const MAX_PRICE_HISTORY = 20;
const SIGNAL_TIMEOUT_MS = 5_000;

// Rolling state — persists across cycles
const priceHistory: number[] = [];
const tvlHistory: { timestamp: number; tvl: number }[] = [];

// Cache of last known values for fallback on fetch failure
let lastSignals: MarketSignals | null = null;

/**
 * Fetch all 5 signals in parallel with per-signal timeout.
 * Failed signals use last known values with stale flag.
 */
export async function fetchAllSignals(wdk: WDK): Promise<MarketSignals> {
  const [priceResult, healthResult, ratesResult, sentimentResult, tvlResult] =
    await Promise.allSettled([
      withTimeout(fetchPrice(), SIGNAL_TIMEOUT_MS),
      withTimeout(fetchHealth(wdk), SIGNAL_TIMEOUT_MS),
      withTimeout(fetchAaveRates(), SIGNAL_TIMEOUT_MS),
      withTimeout(fetchSentiment(), SIGNAL_TIMEOUT_MS),
      withTimeout(fetchTvl(), SIGNAL_TIMEOUT_MS),
    ]);

  const price = resolveSignal(priceResult, lastSignals?.price, buildDefaultPrice);
  const health = resolveSignal(healthResult, lastSignals?.health, buildDefaultHealth);
  const rates = resolveSignal(ratesResult, lastSignals?.aave, buildDefaultRates);
  const sentiment = resolveSignal(sentimentResult, lastSignals?.sentiment, buildDefaultSentiment);
  const tvl = resolveSignal(tvlResult, lastSignals?.tvl, buildDefaultTvl);

  // Compute volatility from price history (no fetch needed — derived from existing data)
  const volatility: VolatilitySignal = computeVolatility(priceHistory);

  const signals: MarketSignals = { price, aave: rates, health, sentiment, tvl, volatility };
  lastSignals = signals;
  return signals;
}

// ─── Individual Signal Fetchers ───

/**
 * Fetch ETH price from Bitfinex via WDK pricing client.
 * Append to rolling history. Compute SMA20, RSI14, trend.
 */
async function fetchPrice(): Promise<PriceSignal> {
  const pricing = getPricingClient();
  const current = await pricing.getCurrentPrice('ETH', 'USD');

  // Append to rolling history
  priceHistory.push(current);
  if (priceHistory.length > MAX_PRICE_HISTORY) {
    priceHistory.shift();
  }

  const sma20 = computeSMA(priceHistory, 20);
  const rsi14 = computeRSI(priceHistory, 14);
  const trend = detectTrend(current, sma20);

  return {
    asset: 'ETH',
    current,
    history: [...priceHistory],
    sma20,
    rsi14,
    trend,
  };
}

/**
 * Fetch Aave account data via WDK lending module.
 * Returns health factor, liquidation threshold, LTV.
 */
async function fetchHealth(wdk: WDK): Promise<HealthSignal> {
  const lending = await getAaveLending(wdk);
  const data: WdkAccountData = await lending.getAccountData();
  return {
    current: healthFactorToNumber(data.healthFactor),
    liquidationThreshold: Number(data.currentLiquidationThreshold),
    ltv: Number(data.ltv),
  };
}

/**
 * Fetch Aave reserve data for WETH via raw eth_call to Pool Data Provider.
 * Returns supply APY, borrow APY, utilization.
 *
 * Contract: AaveV3 PoolDataProvider (0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654)
 * Function: getReserveData(address asset) → returns struct with 14 fields
 * Selector: 0x35ea6a75 (first 4 bytes of keccak256("getReserveData(address)"))
 */
async function fetchAaveRates(): Promise<AaveRatesSignal> {
  const selector = '0x35ea6a75';
  const paddedWeth = padAddress(config.addresses.weth);
  const calldata = selector + paddedWeth;

  const result = await ethCall(config.rpcUrl, config.addresses.aaveDataProvider, calldata);

  // ABI: getReserveData(address) returns struct with 14 uint256 fields:
  // [0] unbacked, [1] accruedToTreasuryScaled, [2] totalAToken, [3] totalStableDebt,
  // [4] totalVariableDebt, [5] liquidityRate, [6] variableBorrowRate, [7] stableBorrowRate,
  // [8] averageStableBorrowRate, [9] liquidityIndex, [10] variableBorrowIndex,
  // [11] lastUpdateTimestamp, [12] eModeCategoryId, [13] borrowCap
  const totalAToken = parseUint256(result, 2);
  const totalVariableDebt = parseUint256(result, 4);
  const liquidityRate = parseUint256(result, 5);
  const variableBorrowRate = parseUint256(result, 6);

  // Utilization = totalDebt / totalAToken (aToken supply represents all deposits)
  const utilization = totalAToken > 0n
    ? Number(totalVariableDebt * 10000n / totalAToken) / 10000
    : 0;

  // Available liquidity = aToken supply minus borrowed amount
  const availableLiquidity = (totalAToken - totalVariableDebt).toString();

  return {
    supplyAPY: rayToPercent(liquidityRate),
    borrowAPY: rayToPercent(variableBorrowRate),
    utilization,
    availableLiquidity,
  };
}

/**
 * Fetch Fear & Greed Index from public API.
 * GOTCHA: `value` field is STRING not number — must parseInt().
 */
async function fetchSentiment(): Promise<SentimentSignal> {
  const response = await fetch('https://api.alternative.me/fng/');
  if (!response.ok) throw new Error(`Fear & Greed API returned ${response.status}`);
  const json = (await response.json()) as {
    data: Array<{ value: string; value_classification: string }>;
  };
  const entry = json.data[0];
  return {
    fearGreedIndex: parseInt(entry.value, 10),  // STRING → number
    label: entry.value_classification,
  };
}

/**
 * Fetch Aave TVL from DeFiLlama.
 * GOTCHA: /tvl/aave returns raw number, NOT JSON — use parseFloat on text.
 */
async function fetchTvl(): Promise<TvlSignal> {
  const response = await fetch('https://api.llama.fi/tvl/aave');
  if (!response.ok) throw new Error(`DeFiLlama API returned ${response.status}`);
  const text = await response.text();
  const aaveTVL = parseFloat(text);

  // Track TVL history for 7-day change
  tvlHistory.push({ timestamp: Date.now(), tvl: aaveTVL });
  if (tvlHistory.length > 1000) tvlHistory.shift();

  // Compute 7-day change if we have enough data
  // Use the entry closest to 7 days ago (last entry before the cutoff)
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let oldEntry: { timestamp: number; tvl: number } | undefined;
  for (let i = tvlHistory.length - 1; i >= 0; i--) {
    if (tvlHistory[i].timestamp <= sevenDaysAgoMs) {
      oldEntry = tvlHistory[i];
      break;
    }
  }
  const tvl7dChange = oldEntry
    ? ((aaveTVL - oldEntry.tvl) / oldEntry.tvl) * 100
    : null;

  return { aaveTVL, tvl7dChange };
}

export function getLastSignals(): MarketSignals | null {
  if (!lastSignals) return null;
  // Normalize volatility regime for dashboard
  return {
    ...lastSignals,
    volatility: {
      ...lastSignals.volatility,
      regime: lastSignals.volatility.regime === 'insufficient_data'
        ? 'unknown' as any
        : lastSignals.volatility.regime,
    },
  };
}

// ─── Helpers ───

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function resolveSignal<T>(
  result: PromiseSettledResult<T>,
  fallback: T | undefined,
  buildDefault: () => T
): T {
  if (result.status === 'fulfilled') return result.value;
  return fallback ?? buildDefault();
}

function buildDefaultPrice(): PriceSignal {
  return { asset: 'ETH', current: 0, history: [], sma20: null, rsi14: null, trend: 'insufficient_data' };
}
function buildDefaultHealth(): HealthSignal {
  return { current: 0, liquidationThreshold: 0, ltv: 0 };
}
function buildDefaultRates(): AaveRatesSignal {
  return { supplyAPY: 0, borrowAPY: 0, utilization: 0, availableLiquidity: '0' };
}
function buildDefaultSentiment(): SentimentSignal {
  return { fearGreedIndex: 50, label: 'Neutral' };
}
function buildDefaultTvl(): TvlSignal {
  return { aaveTVL: 0, tvl7dChange: null };
}
