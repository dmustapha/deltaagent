// File: src/execution-engine.ts

import type {
  ExecutionResult,
  StepResult,
  AgentDecision,
  PositionState,
  WdkLendingResult,
  WdkSwapResult,
} from './types.js';
import { config } from './config.js';
import { logError } from './logger.js';
import { calcMaxSafeWithdraw } from './utils.js';
import { getAaveLending, getVeloraSwap, getAccount, getPricingClient } from './wdk-setup.js';
import type WDK from '@tetherto/wdk';
import type { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';

const WETH = config.addresses.weth;
const USDT0 = config.addresses.usdt0;
const AAVE_POOL = config.addresses.aavePool;

/**
 * Approve a token for the Aave Pool spender.
 * WDK requires explicit ERC-20 approval before supply/repay.
 */
async function approveForPool(wdk: WDK, token: string, amount: bigint): Promise<void> {
  const account = await getAccount(wdk) as unknown as WalletAccountEvm;
  await account.approve({ token, spender: AAVE_POOL, amount });
}

/**
 * Execute the appropriate action based on the agent's decision.
 * Returns detailed execution result with per-step tracking.
 */
export async function execute(
  wdk: WDK,
  decision: AgentDecision,
  position: PositionState
): Promise<ExecutionResult> {
  switch (decision.action) {
    case 'OPEN_POSITION':
      return executeLeverage(wdk, decision, position);
    case 'INCREASE':
      return executeLeverage(wdk, decision, position);
    case 'DECREASE':
      return executeDeleverage(wdk, position);
    case 'CLOSE':
      return executeClose(wdk, position);
    default:
      return { success: true, action: 'HOLD', steps: [], gasUsed: 0n };
  }
}

/**
 * LEVERAGE LOOP: supply WETH → borrow USDT0 → swap USDT0→WETH → re-supply WETH
 *
 * This creates a leveraged long ETH position:
 * 1. Supply initial WETH as collateral to Aave
 * 2. Borrow USDT0 against that collateral
 * 3. Swap borrowed USDT0 back to WETH via Velora
 * 4. Re-supply the new WETH to increase the position
 */
async function executeLeverage(
  wdk: WDK,
  decision: AgentDecision,
  position: PositionState
): Promise<ExecutionResult> {
  const steps: StepResult[] = [];
  let totalGas = 0n;

  const lending = await getAaveLending(wdk);
  const swap = await getVeloraSwap(wdk);
  const pricing = getPricingClient();

  try {
    // Determine supply amount
    const supplyAmount = position.isOpen
      ? config.agent.initialCollateralWei / 2n  // INCREASE: add half
      : config.agent.initialCollateralWei;       // OPEN: full initial

    // Step 1: Approve + Supply WETH to Aave
    await approveForPool(wdk, WETH, supplyAmount);
    const supplyResult: WdkLendingResult = await lending.supply({
      token: WETH,
      amount: supplyAmount,
    });
    steps.push({
      operation: 'supply',
      hash: supplyResult.hash,
      amount: supplyAmount.toString(),
      success: true,
    });
    totalGas += supplyResult.fee;

    // Step 2: Calculate borrow amount based on target leverage
    // Units: USDT0 has 6 decimals. We use 1e6 scaling for USD price and multiplier.
    const targetLeverage = decision.parameters?.targetLeverage ?? 1.5;
    const ethPrice = await pricing.getCurrentPrice('ETH', 'USD');
    // ethPriceScaled: USD per ETH, scaled by 1e6 (e.g., $2000 → 2_000_000_000n)
    const ethPriceScaled = BigInt(Math.floor(ethPrice * 1e6));
    // collateralValueUsdt: WETH amount (18 dec) × price (6 dec) / 1e18 = USDT0 amount (6 dec)
    const collateralValueUsdt = supplyAmount * ethPriceScaled / 10n ** 18n;
    // leverageMultiplier: (leverage - 1) scaled by 1e6 (e.g., 0.5× → 500_000n)
    const leverageMultiplier = BigInt(Math.floor((targetLeverage - 1) * 1e6));
    // borrowAmount: USDT0 (6 dec) × multiplier (6 dec) / 1e6 = USDT0 (6 dec)
    const borrowAmount = collateralValueUsdt * leverageMultiplier / 1_000_000n;

    if (borrowAmount <= 0n) {
      return { success: true, action: decision.action, steps, gasUsed: totalGas };
    }

    // Step 3: Borrow USDT0 from Aave
    const borrowResult: WdkLendingResult = await lending.borrow({
      token: USDT0,
      amount: borrowAmount,
    });
    steps.push({
      operation: 'borrow',
      hash: borrowResult.hash,
      amount: borrowAmount.toString(),
      success: true,
    });
    totalGas += borrowResult.fee;

    // Step 4: Swap USDT0 → WETH via Velora
    const swapResult: WdkSwapResult = await swap.swap({
      tokenIn: USDT0,
      tokenOut: WETH,
      tokenInAmount: borrowAmount,
    });
    steps.push({
      operation: 'swap',
      hash: swapResult.hash,
      amount: swapResult.tokenOutAmount.toString(),
      success: true,
    });
    totalGas += swapResult.fee;

    // Step 5: Approve + Re-supply swapped WETH to Aave
    await approveForPool(wdk, WETH, swapResult.tokenOutAmount);
    const reSupplyResult: WdkLendingResult = await lending.supply({
      token: WETH,
      amount: swapResult.tokenOutAmount,
    });
    steps.push({
      operation: 'supply',
      hash: reSupplyResult.hash,
      amount: swapResult.tokenOutAmount.toString(),
      success: true,
    });
    totalGas += reSupplyResult.fee;

    return { success: true, action: decision.action, steps, gasUsed: totalGas };
  } catch (error) {
    logError(error, `executeLeverage:${steps.length > 0 ? steps[steps.length - 1].operation : 'init'}`);
    return handleLeverageFailure(steps, error, totalGas, decision.action);
  }
}

/**
 * DELEVERAGE: withdraw WETH → swap WETH→USDT0 → repay USDT0
 *
 * Reduces leverage by repaying a portion of debt.
 * Withdraws 50% of safe excess collateral per cycle.
 */
async function executeDeleverage(
  wdk: WDK,
  _position: PositionState
): Promise<ExecutionResult> {
  const steps: StepResult[] = [];
  let totalGas = 0n;

  const lending = await getAaveLending(wdk);
  const swap = await getVeloraSwap(wdk);
  const pricing = getPricingClient();

  try {
    const accountData = await lending.getAccountData();
    const ethPrice = await pricing.getCurrentPrice('ETH', 'USD');

    // Calculate safe withdrawal amount using liquidationThreshold (not LTV)
    const maxSafe = calcMaxSafeWithdraw(
      accountData.totalCollateralBase,
      accountData.totalDebtBase,
      accountData.currentLiquidationThreshold,
      ethPrice
    );

    // Withdraw 50% of safe amount (conservative — leave room)
    // null means no debt — withdraw initial collateral amount
    const withdrawAmount = maxSafe === null
      ? config.agent.initialCollateralWei
      : maxSafe / 2n;

    if (withdrawAmount <= 0n) {
      return {
        success: false,
        action: 'DECREASE',
        steps: [],
        gasUsed: 0n,
        error: 'Cannot safely withdraw any collateral',
      };
    }

    // Step 1: Withdraw WETH from Aave
    const withdrawResult: WdkLendingResult = await lending.withdraw({
      token: WETH,
      amount: withdrawAmount,
    });
    steps.push({
      operation: 'withdraw',
      hash: withdrawResult.hash,
      amount: withdrawAmount.toString(),
      success: true,
    });
    totalGas += withdrawResult.fee;

    // Step 2: Swap WETH → USDT0 via Velora
    const swapResult: WdkSwapResult = await swap.swap({
      tokenIn: WETH,
      tokenOut: USDT0,
      tokenInAmount: withdrawAmount,
    });
    steps.push({
      operation: 'swap',
      hash: swapResult.hash,
      amount: swapResult.tokenOutAmount.toString(),
      success: true,
    });
    totalGas += swapResult.fee;

    // Step 3: Repay USDT0 debt — refresh accountData for accurate debt
    // Aave base currency = 8 decimals, USDT0 = 6 decimals → divide by 100
    const freshData = await lending.getAccountData();
    const currentDebtUsdt = freshData.totalDebtBase / 100n;
    const repayAmount = swapResult.tokenOutAmount < currentDebtUsdt
      ? swapResult.tokenOutAmount
      : currentDebtUsdt;

    await approveForPool(wdk, USDT0, repayAmount);
    const repayResult: WdkLendingResult = await lending.repay({
      token: USDT0,
      amount: repayAmount,
    });
    steps.push({
      operation: 'repay',
      hash: repayResult.hash,
      amount: repayAmount.toString(),
      success: true,
    });
    totalGas += repayResult.fee;

    return { success: true, action: 'DECREASE', steps, gasUsed: totalGas };
  } catch (error) {
    logError(error, `executeDeleverage:${steps.length > 0 ? steps[steps.length - 1].operation : 'init'}`);
    return handleDeleverageFailure(steps, error, totalGas);
  }
}

/**
 * CLOSE: Full position unwind.
 * Multiple rounds of withdraw→swap→repay until debt = 0, then withdraw remaining.
 * Also handles profit disbursement if position was profitable.
 */
async function executeClose(
  wdk: WDK,
  position: PositionState
): Promise<ExecutionResult> {
  const steps: StepResult[] = [];
  let totalGas = 0n;

  const lending = await getAaveLending(wdk);
  const swap = await getVeloraSwap(wdk);
  const pricing = getPricingClient();

  try {
    const MAX_CLOSE_ROUNDS = 5;

    for (let round = 0; round < MAX_CLOSE_ROUNDS; round++) {
      const accountData = await lending.getAccountData();

      // If no debt remaining, break out
      if (accountData.totalDebtBase === 0n) break;

      const ethPrice = await pricing.getCurrentPrice('ETH', 'USD');

      // Calculate safe withdrawal — withdraw as much as safely possible
      const maxSafe = calcMaxSafeWithdraw(
        accountData.totalCollateralBase,
        accountData.totalDebtBase,
        accountData.currentLiquidationThreshold,
        ethPrice
      );

      // null = no debt (shouldn't happen inside this loop, but handle gracefully)
      if (maxSafe !== null && maxSafe <= 0n) {
        return {
          success: false,
          action: 'CLOSE',
          steps,
          gasUsed: totalGas,
          error: `Cannot safely withdraw in round ${round + 1}. Position may need manual intervention.`,
        };
      }

      // Withdraw WETH — compute amount from collateral if no debt, otherwise use maxSafe
      const ethPriceBase = BigInt(Math.floor(ethPrice * 1e8));
      const withdrawAmount = maxSafe === null
        ? accountData.totalCollateralBase * 10n ** 18n / ethPriceBase
        : maxSafe;

      const withdrawResult: WdkLendingResult = await lending.withdraw({
        token: WETH,
        amount: withdrawAmount,
      });
      steps.push({
        operation: 'withdraw',
        hash: withdrawResult.hash,
        amount: withdrawAmount.toString(),
        success: true,
      });
      totalGas += withdrawResult.fee;

      // Swap WETH → USDT0
      const swapResult: WdkSwapResult = await swap.swap({
        tokenIn: WETH,
        tokenOut: USDT0,
        tokenInAmount: withdrawAmount,
      });
      steps.push({
        operation: 'swap',
        hash: swapResult.hash,
        amount: swapResult.tokenOutAmount.toString(),
        success: true,
      });
      totalGas += swapResult.fee;

      // Repay debt
      const freshData = await lending.getAccountData();
      const currentDebtUsdt = freshData.totalDebtBase / 100n;
      const repayAmount = swapResult.tokenOutAmount < currentDebtUsdt
        ? swapResult.tokenOutAmount
        : currentDebtUsdt;

      await approveForPool(wdk, USDT0, repayAmount);
      const repayResult: WdkLendingResult = await lending.repay({
        token: USDT0,
        amount: repayAmount,
      });
      steps.push({
        operation: 'repay',
        hash: repayResult.hash,
        amount: repayAmount.toString(),
        success: true,
      });
      totalGas += repayResult.fee;
    }

    // Final: withdraw ALL remaining collateral (debt should be 0 now)
    const finalData = await lending.getAccountData();
    if (finalData.totalCollateralBase > 0n && finalData.totalDebtBase === 0n) {
      // Compute actual collateral in WETH instead of using maxUint256
      const finalPrice = await pricing.getCurrentPrice('ETH', 'USD');
      const finalPriceBase = BigInt(Math.floor(finalPrice * 1e8));
      const remainingWeth = finalPriceBase > 0n
        ? finalData.totalCollateralBase * 10n ** 18n / finalPriceBase
        : config.agent.initialCollateralWei;

      const finalWithdraw: WdkLendingResult = await lending.withdraw({
        token: WETH,
        amount: remainingWeth,
      });
      steps.push({
        operation: 'withdraw',
        hash: finalWithdraw.hash,
        amount: remainingWeth.toString(),
        success: true,
      });
      totalGas += finalWithdraw.fee;
    }

    // Profit Disbursement — PRD Flow 5
    // Use fresh on-chain data, not pre-close position state
    const disbursement = await handleProfitDisbursement(wdk, position, steps);

    return {
      success: true,
      action: 'CLOSE',
      steps,
      gasUsed: totalGas,
      disbursement: disbursement ?? undefined,
    };
  } catch (error) {
    logError(error, `executeClose:${steps.length > 0 ? steps[steps.length - 1].operation : 'init'}`);
    return {
      success: false,
      action: 'CLOSE',
      steps,
      gasUsed: totalGas,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * PROFIT DISBURSEMENT: Transfer profitWeth * PROFIT_DISBURSE_PCT to treasury.
 * Uses WDK account.transfer() for ERC-20 transfers (type-safe).
 */
async function handleProfitDisbursement(
  wdk: WDK,
  position: PositionState,
  steps: StepResult[]
): Promise<{ amountWeth: string; txHash: string; treasuryAddress: string } | null> {
  if (!position.isOpen) return null;

  const pricing = getPricingClient();
  const currentPrice = await pricing.getCurrentPrice('ETH', 'USD');

  // Calculate realized P&L using entry price and initial collateral
  // Position is already closed — debt is 0, remaining WETH is profit + principal
  const initialEth = Number(position.collateralWeth) / 1e18;
  const realizedPnlUsd = (currentPrice - position.entryPrice) * initialEth;

  if (realizedPnlUsd <= 0) {
    console.log(`  Position closed at loss ($${realizedPnlUsd.toFixed(2)}). No disbursement.`);
    return null;
  }

  // Convert profit to WETH
  const profitWeth = realizedPnlUsd / currentPrice;
  const disbursePct = config.agent.profitDisbursePct;
  const disbursementWeth = BigInt(Math.floor(profitWeth * disbursePct * 1e18));

  if (disbursementWeth <= 0n) return null;

  try {
    const account = await getAccount(wdk);

    // Use WDK transfer() — type-safe ERC-20 transfer
    const txResult = await account.transfer({
      token: WETH,
      recipient: config.agent.treasuryAddress,
      amount: disbursementWeth,
    });

    steps.push({
      operation: 'transfer',
      hash: txResult.hash,
      amount: disbursementWeth.toString(),
      success: true,
    });

    return {
      amountWeth: disbursementWeth.toString(),
      txHash: txResult.hash,
      treasuryAddress: config.agent.treasuryAddress,
    };
  } catch (error) {
    logError(error, 'profitDisbursement');
    // Disbursement failure is not critical — position is already closed
    return null;
  }
}

// ─── Failure Recovery ───

function handleLeverageFailure(
  steps: StepResult[],
  error: unknown,
  totalGas: bigint,
  action: string
): ExecutionResult {
  const errorMsg = error instanceof Error ? error.message : String(error);

  // Record the failed step immutably — replace last step with a copy marked as failed
  const lastStep = steps[steps.length - 1];
  if (lastStep) {
    steps[steps.length - 1] = { ...lastStep, success: false, error: errorMsg };
  }

  return {
    success: false,
    action,
    steps,
    gasUsed: totalGas,
    error: `Leverage loop failed at step ${steps.length}: ${errorMsg}`,
  };
}

function handleDeleverageFailure(
  steps: StepResult[],
  error: unknown,
  totalGas: bigint
): ExecutionResult {
  const errorMsg = error instanceof Error ? error.message : String(error);

  const lastStep = steps[steps.length - 1];
  if (lastStep) {
    steps[steps.length - 1] = { ...lastStep, success: false, error: errorMsg };
  }

  return {
    success: false,
    action: 'DECREASE',
    steps,
    gasUsed: totalGas,
    error: `Deleverage failed at step ${steps.length}: ${errorMsg}`,
  };
}
