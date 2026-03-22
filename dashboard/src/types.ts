export interface DashboardState {
  agent: {
    status: 'running' | 'paused' | 'stopped' | 'cooldown';
    cycleNumber: number;
    cycleIntervalMs: number;
    lastCycleTimestamp: number | null;
    uptime: number;
    mockMode: boolean;
    consecutiveFailures: number;
    cooldownRemaining: number;
    tokenUsage: { used: number; limit: number };
  };
  wallet: {
    address: string;
    ethBalance: string;
    chain: string;
    chainId: number;
  };
  position: {
    isOpen: boolean;
    healthFactor: number;
    collateralUsd: number;
    debtUsd: number;
    netWorthUsd: number;
    leverageRatio: number;
    liquidationPrice: number | null;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnlUsd: number;
    unrealizedPnlPct: number;
    realizedPnlUsd: number;
    collateralWeth: string;
    debtUsdt: string;
  };
  signals: {
    price: { current: number; trend: string; sma20: number | null; rsi14: number | null };
    sentiment: { fearGreedIndex: number; label: string; priorDay?: number; priorWeek?: number };
    volatility: { current: number | null; regime: string };
    aave: { supplyAPY: number; borrowAPY: number; utilization: number };
    health: { current: number; liquidationThreshold: number; ltv: number };
    tvl: { aaveTVL: number; tvl7dChange: number | null };
  } | null;
  currentDecision: {
    action: string;
    reasoning: string;
    confidence: number;
    targetLeverage: number | null;
    timestamp: number;
    isProcessing: boolean;
  };
  decisionHistory: Array<{
    cycle: number;
    action: string;
    confidence: number;
    reasoning: string;
    timestamp: number;
  }>;
  transactions: Array<{
    cycle: number;
    action: string;
    details: string;
    txHash: string;
    status: 'success' | 'failed' | 'partial';
    timestamp: number;
    triggeredBy: 'ai' | 'safety' | 'user';
  }>;
  config: {
    maxLeverage: number;
    minHealthFactor: number;
    cycleIntervalMs: number;
    useMockLlm: boolean;
    initialCollateralWei: string;
    volatilityLimit: number;
    rebalanceThreshold: number;
    autoRebalance: boolean;
    emergencyExit: boolean;
  };
}
