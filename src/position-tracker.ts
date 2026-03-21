// File: src/position-tracker.ts

import type { PositionState, CycleResult, WdkAccountData } from './types.js';
import { config } from './config.js';
import { healthFactorToNumber } from './utils.js';
import { getAaveLending, getPricingClient } from './wdk-setup.js';
import type WDK from '@tetherto/wdk';

// In-memory state — resets on restart (sufficient for hackathon demo)
let currentPosition: PositionState = buildEmptyPosition();
const cycleHistory: CycleResult[] = [];

export function getPosition(): PositionState {
  return { ...currentPosition };
}

export function getHistory(): CycleResult[] {
  return [...cycleHistory];
}

export function recordCycle(result: CycleResult): void {
  cycleHistory.push(result);
}

/**
 * Set entry price when opening a new position.
 */
export function setEntryPrice(price: number): void {
  currentPosition = { ...currentPosition, entryPrice: price, isOpen: true };
}

/**
 * Mark position as closed and reset P&L.
 */
export function closePosition(): void {
  currentPosition = {
    ...currentPosition,
    isOpen: false,
    collateralWeth: 0n,
    debtUsdt: 0n,
    healthFactor: 999,
    leverageRatio: 0,
    netPositionEth: 0,
    unrealizedPnlUsd: 0,
    unrealizedPnlPct: 0,
  };
}

/**
 * Refresh position state from live Aave data.
 * Computes leverage ratio and P&L from on-chain values.
 */
export async function updatePosition(wdk: WDK): Promise<PositionState> {
  const lending = await getAaveLending(wdk);
  const pricing = getPricingClient();

  const accountData: WdkAccountData = await lending.getAccountData();
  const currentPrice = await pricing.getCurrentPrice('ETH', 'USD');

  const healthFactor = healthFactorToNumber(accountData.healthFactor);
  const isOpen = accountData.totalDebtBase > 0n;

  // Convert base currency (USD, 8 decimals) to token amounts
  const ethPriceBase = BigInt(Math.floor(currentPrice * 1e8));

  // collateralWeth = totalCollateralBase (USD 8dec) → WETH (18dec)
  const collateralWeth = ethPriceBase > 0n
    ? accountData.totalCollateralBase * 10n ** 18n / ethPriceBase
    : 0n;

  // debtUsdt = totalDebtBase (USD 8dec) → USDT0 (6dec)
  // 1 USDT0 = $1, so: debtUsdt = totalDebtBase / 100
  const debtUsdt = accountData.totalDebtBase / 100n;

  // Leverage ratio = collateral value / (collateral value - debt value)
  const collateralUsd = Number(accountData.totalCollateralBase) / 1e8;
  const debtUsd = Number(accountData.totalDebtBase) / 1e8;
  const equityUsd = collateralUsd - debtUsd;
  const leverageRatio = equityUsd > 0 ? collateralUsd / equityUsd : 0;

  // P&L calculations (from PRD Appendix B)
  const netPositionEth = Number(collateralWeth) / 1e18 - (Number(debtUsdt) / 1e6 / currentPrice);
  const entryPrice = currentPosition.entryPrice || currentPrice;
  const initialCollateralEth = Number(config.agent.initialCollateralWei) / 1e18;
  const unrealizedPnlUsd = isOpen ? (currentPrice - entryPrice) * netPositionEth : 0;
  const unrealizedPnlPct = isOpen && entryPrice > 0 && initialCollateralEth > 0
    ? (unrealizedPnlUsd / (entryPrice * initialCollateralEth)) * 100
    : 0;

  currentPosition = {
    isOpen,
    collateralWeth,
    debtUsdt,
    healthFactor,
    leverageRatio,
    entryPrice: isOpen ? entryPrice : 0,
    currentPrice,
    netPositionEth: isOpen ? netPositionEth : 0,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    cycleCount: currentPosition.cycleCount + 1,
    actionCount: currentPosition.actionCount,
    totalGasUsed: currentPosition.totalGasUsed,
  };

  return { ...currentPosition };
}

/**
 * Increment action count after a successful execution.
 */
export function incrementActions(gasUsed: bigint): void {
  currentPosition = {
    ...currentPosition,
    actionCount: currentPosition.actionCount + 1,
    totalGasUsed: currentPosition.totalGasUsed + gasUsed,
  };
}

function buildEmptyPosition(): PositionState {
  return {
    isOpen: false,
    collateralWeth: 0n,
    debtUsdt: 0n,
    healthFactor: 999,
    leverageRatio: 0,
    entryPrice: 0,
    currentPrice: 0,
    netPositionEth: 0,
    unrealizedPnlUsd: 0,
    unrealizedPnlPct: 0,
    cycleCount: 0,
    actionCount: 0,
    totalGasUsed: 0n,
  };
}
