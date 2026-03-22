// File: src/types.ts

// ─── Agent Configuration ───

export interface AgentConfig {
  cycleIntervalMs: number;       // Default 8_000 (demo), 60_000 (extended)
  maxLeverage: number;           // Hard cap: 3.0
  minHealthFactor: number;       // Safety threshold: 1.3
  minConfidence: number;         // LLM confidence floor: 0.6
  initialCollateralWei: bigint;  // WETH to start with (e.g., 5e18 = 5 WETH)
  profitDisbursePct: number;     // 0.10 = 10% of profit to treasury
  treasuryAddress: string;       // Address for profit disbursement
  maxCycles: number;             // Hard stop: 100 cycles per run
  volatilityLimit: number;       // Max volatility before agent avoids new positions (default 0.6)
  rebalanceThreshold: number;    // % deviation to trigger rebalance (default 15)
  autoRebalance: boolean;        // Auto-adjust position on threshold breach
  emergencyExit: boolean;        // Auto-close if HF < minimum
}

export interface AppConfig {
  rpcUrl: string;
  groqApiKey: string;
  seedPhrase: string;
  chainId: number;
  useMockLlm: boolean;          // true = use mock for development
  addresses: {
    aavePool: string;
    aaveDataProvider: string;
    weth: string;
    usdt0: string;
    gmxVaultWhale: string;
    uniswapRouter: string;
  };
  agent: AgentConfig;
}

// ─── Market Signals ───

export interface PriceSignal {
  asset: string;
  current: number;
  history: number[];             // Rolling window, max 20 entries
  sma20: number | null;          // null if < 20 data points
  rsi14: number | null;          // null if < 15 data points
  trend: 'up' | 'down' | 'flat' | 'insufficient_data';
}

export interface AaveRatesSignal {
  supplyAPY: number;             // Annual percentage yield for WETH supply
  borrowAPY: number;             // Annual percentage yield for WETH variable borrow
  utilization: number;           // 0-1, utilization ratio
  availableLiquidity: string;    // Raw bigint as string (WETH available to borrow)
}

export interface HealthSignal {
  current: number;               // Health factor (1e18 = 1.0 from Aave, converted to float)
  liquidationThreshold: number;  // In basis points (e.g., 8250 = 82.5%)
  ltv: number;                   // In basis points (e.g., 8000 = 80%)
}

export interface SentimentSignal {
  fearGreedIndex: number;        // 0-100
  label: string;                 // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
}

export interface TvlSignal {
  aaveTVL: number;               // USD value
  tvl7dChange: number | null;    // null if < 2 readings
}

export interface VolatilitySignal {
  current: number | null;   // Rolling stddev of returns (null if insufficient data)
  regime: 'low' | 'medium' | 'high' | 'insufficient_data';
}

export interface MarketSignals {
  price: PriceSignal;
  aave: AaveRatesSignal;
  health: HealthSignal;
  sentiment: SentimentSignal;
  tvl: TvlSignal;
  volatility: VolatilitySignal;
}

// ─── AI Decision ───

export type AgentAction = 'OPEN_POSITION' | 'INCREASE' | 'DECREASE' | 'CLOSE' | 'HOLD';

export interface AgentDecision {
  action: AgentAction;
  reasoning: string;             // Max 30 words
  confidence: number;            // 0.0 - 1.0
  parameters?: {
    amount?: string;             // bigint as string
    targetLeverage?: number;
    targetHealthFactor?: number;
  };
}

// ─── Execution ───

export interface StepResult {
  operation: 'supply' | 'borrow' | 'swap' | 'repay' | 'withdraw' | 'transfer';
  hash: string;
  amount: string;                // bigint as string for logging
  success: boolean;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  action: string;
  steps: StepResult[];
  gasUsed: bigint;
  error?: string;
  partialClose?: boolean;        // true if close loop exited mid-unwind
  disbursement?: {
    amountWeth: string;          // bigint as string
    txHash: string;
    treasuryAddress: string;
    realizedPnlUsd: number;      // Full realized P&L (not just disbursed portion)
  };
}

// ─── Position State ───

export interface PositionState {
  isOpen: boolean;
  collateralWeth: bigint;        // Total WETH supplied to Aave
  debtUsdt: bigint;              // Total USDT0 borrowed
  healthFactor: number;          // Converted from bigint (1e18 → float)
  leverageRatio: number;         // collateral value / (collateral - debt) value
  entryPrice: number;            // ETH price when position opened
  currentPrice: number;          // Latest ETH price
  netPositionEth: number;        // collateralWeth - (debtUsdt / currentPrice)
  unrealizedPnlUsd: number;      // (currentPrice - entryPrice) * netPositionEth
  unrealizedPnlPct: number;      // percentage P&L relative to initial capital
  cycleCount: number;
  actionCount: number;
  totalGasUsed: bigint;
  realizedPnlUsd: number;         // Cumulative realized P&L across all closed positions
  realizedPnlCount: number;       // Number of closed positions
}

// ─── Cycle Result ───

export interface CycleResult {
  cycleNumber: number;
  timestamp: number;
  signals: MarketSignals;
  decision: AgentDecision;
  execution: ExecutionResult | null;
  position: PositionState;
  safetyOverride: boolean;       // true if LLM was bypassed
}

// ─── WDK Types ───
// These mirror the shapes returned by WDK SDK methods.
// Tagged [VERIFIED] based on docs.wdk.tether.io API reference.

export interface WdkLendingResult {
  hash: string;
  fee: bigint;
  approveHash?: string;
}

export interface WdkSwapResult {
  hash: string;
  fee: bigint;
  tokenInAmount: bigint;
  tokenOutAmount: bigint;
  approveHash?: string;
}

export interface WdkQuoteResult {
  fee: bigint;
  tokenInAmount: bigint;
  tokenOutAmount: bigint;
}

export interface WdkAccountData {
  totalCollateralBase: bigint;   // USD, 8 decimals
  totalDebtBase: bigint;         // USD, 8 decimals
  availableBorrowsBase: bigint;  // USD, 8 decimals
  currentLiquidationThreshold: bigint; // basis points
  ltv: bigint;                   // basis points
  healthFactor: bigint;          // 1e18 = 1.0
}
