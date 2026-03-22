// File: src/state-collector.ts

import { getPosition, getHistory } from './position-tracker.js';
import { getAgentStatus } from './agent-loop.js';
import { getLastSignals } from './signal-aggregator.js';
import { config } from './config.js';
import { getTokenUsage } from './ai-brain.js';

// ─── State ───
let walletAddress = '';
const startTimestamp = Date.now();

// Transaction log — ring buffer, max 50
interface TransactionEntry {
  cycle: number;
  action: string;
  details: string;
  txHash: string;
  status: 'success' | 'failed' | 'partial';
  timestamp: number;
  triggeredBy: 'ai' | 'safety' | 'user';
}
const transactionLog: TransactionEntry[] = [];
const MAX_TX_LOG = 50;

// ETH balance cache
let cachedEthBalance = '0';
let ethBalanceFetchedAt = 0;
const ETH_BALANCE_CACHE_MS = 10_000;

export function initStateCollector(address: string): void {
  walletAddress = address;
}

export function recordTransaction(entry: TransactionEntry): void {
  transactionLog.push(entry);
  if (transactionLog.length > MAX_TX_LOG) transactionLog.shift();
}

async function fetchEthBalance(): Promise<string> {
  if (Date.now() - ethBalanceFetchedAt < ETH_BALANCE_CACHE_MS) return cachedEthBalance;
  try {
    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_getBalance',
        params: [walletAddress, 'latest'], id: 1,
      }),
    });
    const json = (await res.json()) as { result?: string };
    cachedEthBalance = json.result ? (Number(BigInt(json.result)) / 1e18).toFixed(4) : '0';
    ethBalanceFetchedAt = Date.now();
  } catch {
    // Use cached value on failure
  }
  return cachedEthBalance;
}

export async function getState(): Promise<Record<string, unknown>> {
  const position = getPosition();
  const agentStatus = getAgentStatus();
  const signals = getLastSignals();
  const history = getHistory();
  const ethBalance = await fetchEthBalance();
  const tokenUsage = getTokenUsage();

  // Derive USD values from raw token amounts
  const currentPrice = position.currentPrice || signals?.price.current || 0;
  const collateralUsd = Number(position.collateralWeth) / 1e18 * currentPrice;
  const debtUsd = Number(position.debtUsdt) / 1e6;
  const netWorthUsd = collateralUsd - debtUsd;

  // Liquidation price approximation
  const collateralEth = Number(position.collateralWeth) / 1e18;
  const liqThreshold = signals?.health.liquidationThreshold || 8250;
  const liquidationPrice = collateralEth > 0 && position.isOpen
    ? debtUsd / (collateralEth * liqThreshold / 10000)
    : null;

  // Derive agent status string
  const status = !agentStatus.running ? 'stopped'
    : agentStatus.paused ? 'paused'
    : agentStatus.cooldownRemaining > 0 ? 'cooldown'
    : 'running';

  // Build decision history from cycle history (last 20)
  const decisionHistory = history.slice(-20).map(h => ({
    cycle: h.cycleNumber,
    action: h.decision.action,
    confidence: h.decision.confidence,
    reasoning: h.decision.reasoning,
    timestamp: h.timestamp,
  }));

  // Current decision from most recent cycle
  const lastCycle = history.length > 0 ? history[history.length - 1] : null;
  const currentDecision = lastCycle ? {
    action: lastCycle.decision.action,
    reasoning: lastCycle.decision.reasoning,
    confidence: lastCycle.decision.confidence,
    targetLeverage: lastCycle.decision.parameters?.targetLeverage ?? null,
    timestamp: lastCycle.timestamp,
    isProcessing: agentStatus.isProcessing,
  } : {
    action: 'HOLD',
    reasoning: 'Waiting for first cycle...',
    confidence: 0,
    targetLeverage: null,
    timestamp: Date.now(),
    isProcessing: agentStatus.isProcessing,
  };

  return {
    agent: {
      status,
      cycleNumber: agentStatus.cycleCount,
      cycleIntervalMs: config.agent.cycleIntervalMs,
      lastCycleTimestamp: lastCycle?.timestamp ?? null,
      uptime: Date.now() - startTimestamp,
      mockMode: config.useMockLlm,
      consecutiveFailures: agentStatus.consecutiveFailures,
      cooldownRemaining: agentStatus.cooldownRemaining,
      tokenUsage,
    },
    wallet: {
      address: walletAddress,
      ethBalance,
      chain: 'arbitrum',
      chainId: 42161,
    },
    position: {
      isOpen: position.isOpen,
      healthFactor: position.healthFactor,
      collateralUsd,
      debtUsd,
      netWorthUsd,
      leverageRatio: position.leverageRatio,
      liquidationPrice,
      entryPrice: position.entryPrice,
      currentPrice,
      unrealizedPnlUsd: position.unrealizedPnlUsd,
      unrealizedPnlPct: position.unrealizedPnlPct,
      realizedPnlUsd: position.realizedPnlUsd,
      collateralWeth: position.collateralWeth.toString(),
      debtUsdt: position.debtUsdt.toString(),
    },
    signals: signals ? {
      price: {
        current: signals.price.current,
        trend: signals.price.trend,
        sma20: signals.price.sma20,
        rsi14: signals.price.rsi14,
      },
      sentiment: signals.sentiment,
      volatility: signals.volatility,
      aave: {
        supplyAPY: signals.aave.supplyAPY,
        borrowAPY: signals.aave.borrowAPY,
        utilization: signals.aave.utilization,
      },
      health: signals.health,
      tvl: signals.tvl,
    } : null,
    currentDecision,
    decisionHistory,
    transactions: [...transactionLog],
    config: {
      maxLeverage: config.agent.maxLeverage,
      minHealthFactor: config.agent.minHealthFactor,
      cycleIntervalMs: config.agent.cycleIntervalMs,
      useMockLlm: config.useMockLlm,
      initialCollateralWei: config.agent.initialCollateralWei.toString(),
      volatilityLimit: config.agent.volatilityLimit,
      rebalanceThreshold: config.agent.rebalanceThreshold,
      autoRebalance: config.agent.autoRebalance,
      emergencyExit: config.agent.emergencyExit,
    },
  };
}

/** JSON replacer that converts bigint to string */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
