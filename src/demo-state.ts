// File: src/demo-state.ts
// Generates realistic, time-varying dashboard state for demo videos.
// Activated via DEMO_MODE=true env var. All data drifts smoothly over time.

import { config } from './config.js';

const DEMO_START = Date.now();
const CYCLE_INTERVAL_MS = 8_000;
const WALLET_ADDRESS = '0x7a3B52F1C6D8e2E9aD4f3c7B1dE8F0A2C5D9E1B3';

// Fake but valid-looking Arbitrum tx hashes
const SEED_TX_HASHES = [
  '0x3a7f1c9e4d2b8a6f0e5c3d1b9a7f4e2c8d6b0a3f1e9c7d5b3a1f8e6c4d2b0a',
  '0x8b2e4d6f0a1c3e5b7d9f2a4c6e8b0d3f5a7c9e1b4d6f8a2c0e3b5d7f9a1c3e',
  '0xf1d3b5a7c9e2d4f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d1f3a5c7e9b0d2',
  '0x5c7e9a1b3d5f7a9c1e3b5d7f9a2c4e6b8d0f2a4c6e8b1d3f5a7c9e0b2d4f6a',
  '0xe9b1d3f5a7c0e2b4d6f8a1c3e5b7d9f2a4c6e8b0d3f5a7c9e1b4d6f8a2c0e3',
];

// Decision templates for realistic cycling
const DECISION_TEMPLATES: Array<{ action: string; reasoning: string; confidenceRange: [number, number] }> = [
  { action: 'HOLD', reasoning: 'Market stable, health factor optimal — maintaining position', confidenceRange: [0.72, 0.85] },
  { action: 'HOLD', reasoning: 'RSI neutral, volatility low — no adjustment needed', confidenceRange: [0.65, 0.78] },
  { action: 'HOLD', reasoning: 'Sentiment cooling, waiting for clearer signal', confidenceRange: [0.60, 0.70] },
  { action: 'HOLD', reasoning: 'Aave utilization rising — monitoring borrow costs', confidenceRange: [0.68, 0.80] },
  { action: 'INCREASE', reasoning: 'ETH uptrend confirmed, health factor allows leverage increase', confidenceRange: [0.75, 0.85] },
  { action: 'HOLD', reasoning: 'Recent increase settling, allowing position to stabilize', confidenceRange: [0.70, 0.82] },
  { action: 'HOLD', reasoning: 'TVL stable, borrow rates acceptable — position healthy', confidenceRange: [0.73, 0.84] },
  { action: 'DECREASE', reasoning: 'Volatility spike detected, reducing exposure as precaution', confidenceRange: [0.70, 0.80] },
  { action: 'HOLD', reasoning: 'Post-adjustment cooldown, watching for trend confirmation', confidenceRange: [0.66, 0.75] },
  { action: 'HOLD', reasoning: 'Fear index rising but position well-collateralized', confidenceRange: [0.68, 0.78] },
];

// ─── Smooth drift helpers ───

function smoothOscillation(baseValue: number, amplitude: number, periodMs: number, phaseOffset = 0): number {
  const t = (Date.now() - DEMO_START + phaseOffset) / periodMs;
  return baseValue + amplitude * Math.sin(t * 2 * Math.PI);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function currentCycleNumber(): number {
  return Math.floor((Date.now() - DEMO_START) / CYCLE_INTERVAL_MS) + 1;
}

// ─── Signal generators ───

function generatePrice(): { current: number; sma20: number; rsi14: number; trend: 'up' | 'down' } {
  const base = 2085;
  const current = smoothOscillation(base, 35, 120_000) + smoothOscillation(0, 12, 30_000, 5000);
  const sma20 = smoothOscillation(base, 20, 180_000, 10_000);
  const trend = current > sma20 ? 'up' as const : 'down' as const;
  const rsi14 = clamp(smoothOscillation(52, 15, 90_000, 3000), 25, 75);
  return { current: Math.round(current * 100) / 100, sma20: Math.round(sma20 * 100) / 100, rsi14: Math.round(rsi14 * 10) / 10, trend };
}

function generatePosition(currentPrice: number) {
  const entryPrice = 2048.35;
  const collateralEth = smoothOscillation(0.30, 0.02, 150_000, 7000);
  const collateralUsd = collateralEth * currentPrice;
  const debtUsd = smoothOscillation(350, 15, 200_000, 12000);
  const netWorthUsd = collateralUsd - debtUsd;
  const leverageRatio = collateralUsd / netWorthUsd;
  const healthFactor = smoothOscillation(1.9, 0.25, 100_000, 4000);
  const unrealizedPnlUsd = (currentPrice - entryPrice) * collateralEth;
  const initialCapitalUsd = collateralEth * entryPrice - debtUsd;
  const unrealizedPnlPct = initialCapitalUsd > 0 ? (unrealizedPnlUsd / initialCapitalUsd) * 100 : 0;
  const liqThreshold = 8250;
  const liquidationPrice = debtUsd / (collateralEth * liqThreshold / 10000);

  return {
    isOpen: true,
    healthFactor: clamp(Math.round(healthFactor * 100) / 100, 1.45, 2.35),
    collateralUsd: Math.round(collateralUsd * 100) / 100,
    debtUsd: Math.round(debtUsd * 100) / 100,
    netWorthUsd: Math.round(netWorthUsd * 100) / 100,
    leverageRatio: clamp(Math.round(leverageRatio * 100) / 100, 1.3, 2.0),
    liquidationPrice: Math.round(liquidationPrice * 100) / 100,
    entryPrice,
    currentPrice,
    unrealizedPnlUsd: Math.round(unrealizedPnlUsd * 100) / 100,
    unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
    realizedPnlUsd: 12.47,
    collateralWeth: Math.round(collateralEth * 1e18).toString(),
    debtUsdt: Math.round(debtUsd * 1e6).toString(),
  };
}

function generateDecisionHistory(): Array<{ cycle: number; action: string; confidence: number; reasoning: string; timestamp: number }> {
  const cycle = currentCycleNumber();
  const count = Math.min(cycle, 20);
  const history: Array<{ cycle: number; action: string; confidence: number; reasoning: string; timestamp: number }> = [];

  for (let i = 0; i < count; i++) {
    const cycleNum = cycle - count + 1 + i;
    const templateIdx = cycleNum % DECISION_TEMPLATES.length;
    const template = DECISION_TEMPLATES[templateIdx];
    const [minConf, maxConf] = template.confidenceRange;
    const confidence = minConf + (maxConf - minConf) * ((Math.sin(cycleNum * 1.7) + 1) / 2);

    history.push({
      cycle: cycleNum,
      action: template.action,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: template.reasoning,
      timestamp: DEMO_START + (cycleNum - 1) * CYCLE_INTERVAL_MS,
    });
  }

  return history;
}

function generateTransactions(): Array<{
  cycle: number;
  action: string;
  details: string;
  txHash: string;
  status: 'success' | 'failed' | 'partial';
  timestamp: number;
  triggeredBy: 'ai' | 'safety' | 'user';
}> {
  const baseTime = DEMO_START - 120_000; // pretend they happened before demo start
  return [
    {
      cycle: 1,
      action: 'OPEN_POSITION:supply',
      details: 'supply 300000000000000000',
      txHash: SEED_TX_HASHES[0],
      status: 'success',
      timestamp: baseTime,
      triggeredBy: 'ai',
    },
    {
      cycle: 1,
      action: 'OPEN_POSITION:borrow',
      details: 'borrow 320000000',
      txHash: SEED_TX_HASHES[1],
      status: 'success',
      timestamp: baseTime + 4_000,
      triggeredBy: 'ai',
    },
    {
      cycle: 1,
      action: 'OPEN_POSITION:swap',
      details: 'swap 320000000 USDT → WETH',
      txHash: SEED_TX_HASHES[2],
      status: 'success',
      timestamp: baseTime + 8_000,
      triggeredBy: 'ai',
    },
    {
      cycle: 5,
      action: 'INCREASE:supply',
      details: 'supply 50000000000000000',
      txHash: SEED_TX_HASHES[3],
      status: 'success',
      timestamp: baseTime + 40_000,
      triggeredBy: 'ai',
    },
    {
      cycle: 8,
      action: 'DECREASE:repay',
      details: 'repay 30000000',
      txHash: SEED_TX_HASHES[4],
      status: 'success',
      timestamp: baseTime + 64_000,
      triggeredBy: 'ai',
    },
  ];
}

// ─── Main export ───

export function getDemoState(): Record<string, unknown> {
  const cycle = currentCycleNumber();
  const price = generatePrice();
  const position = generatePosition(price.current);
  const decisionHistory = generateDecisionHistory();
  const currentDecisionEntry = decisionHistory[decisionHistory.length - 1];

  const volatilityCurrent = clamp(smoothOscillation(0.035, 0.015, 80_000, 6000), 0.01, 0.08);
  const volatilityRegime = volatilityCurrent > 0.05 ? 'medium' : 'low';

  const sentimentValue = clamp(Math.round(smoothOscillation(58, 18, 200_000, 9000)), 15, 85);
  const sentimentLabel = sentimentValue <= 25 ? 'Extreme Fear'
    : sentimentValue <= 45 ? 'Fear'
    : sentimentValue <= 55 ? 'Neutral'
    : sentimentValue <= 75 ? 'Greed'
    : 'Extreme Greed';

  return {
    agent: {
      status: 'running',
      cycleNumber: cycle,
      cycleIntervalMs: CYCLE_INTERVAL_MS,
      lastCycleTimestamp: DEMO_START + (cycle - 1) * CYCLE_INTERVAL_MS,
      uptime: Date.now() - DEMO_START,
      mockMode: true,
      consecutiveFailures: 0,
      cooldownRemaining: 0,
      tokenUsage: { used: Math.min(cycle * 127, 9800), limit: 10000 },
    },
    wallet: {
      address: WALLET_ADDRESS,
      ethBalance: '0.0005',
      chain: 'arbitrum',
      chainId: 42161,
    },
    position,
    signals: {
      price: {
        current: price.current,
        trend: price.trend,
        sma20: price.sma20,
        rsi14: price.rsi14,
      },
      sentiment: {
        fearGreedIndex: sentimentValue,
        label: sentimentLabel,
      },
      volatility: {
        current: Math.round(volatilityCurrent * 1000) / 1000,
        regime: volatilityRegime,
      },
      aave: {
        supplyAPY: clamp(smoothOscillation(1.82, 0.3, 150_000, 2000), 0.8, 3.0),
        borrowAPY: clamp(smoothOscillation(2.95, 0.4, 150_000, 8000), 1.5, 5.0),
        utilization: clamp(smoothOscillation(0.42, 0.08, 120_000, 11000), 0.2, 0.7),
      },
      health: {
        current: position.healthFactor,
        liquidationThreshold: 8250,
        ltv: 8000,
      },
      tvl: {
        aaveTVL: smoothOscillation(12_400_000_000, 200_000_000, 300_000, 15000),
        tvl7dChange: smoothOscillation(1.2, 0.8, 250_000, 20000),
      },
    },
    currentDecision: {
      action: currentDecisionEntry.action,
      reasoning: currentDecisionEntry.reasoning,
      confidence: currentDecisionEntry.confidence,
      targetLeverage: currentDecisionEntry.action === 'INCREASE' ? 1.7 : null,
      timestamp: currentDecisionEntry.timestamp,
      isProcessing: false,
    },
    decisionHistory,
    transactions: generateTransactions(),
    config: {
      maxLeverage: config.agent.maxLeverage,
      minHealthFactor: config.agent.minHealthFactor,
      cycleIntervalMs: CYCLE_INTERVAL_MS,
      useMockLlm: true,
      initialCollateralWei: config.agent.initialCollateralWei.toString(),
      volatilityLimit: config.agent.volatilityLimit,
      rebalanceThreshold: config.agent.rebalanceThreshold,
      autoRebalance: config.agent.autoRebalance,
      emergencyExit: config.agent.emergencyExit,
    },
  };
}
