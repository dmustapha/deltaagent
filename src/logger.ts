// File: src/logger.ts

import type { AgentDecision, ExecutionResult, PositionState, MarketSignals } from './types.js';
import { formatWeth, formatUsdt } from './utils.js';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function logStartup(walletAddress: string, rpcUrl: string): void {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║          DELTAAGENT v1.0                ║${RESET}`);
  console.log(`${BOLD}${CYAN}║   AI-Managed Leveraged ETH Positions     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n`);
  console.log(`${DIM}Wallet:${RESET}  ${walletAddress}`);
  console.log(`${DIM}RPC:${RESET}     ${rpcUrl}`);
  console.log(`${DIM}Started:${RESET} ${new Date().toISOString()}\n`);
}

export function logSignals(signals: MarketSignals): void {
  console.log(`${DIM}[${timestamp()}]${RESET} ${BLUE}SIGNALS${RESET}`);
  console.log(`  ${WHITE}ETH Price:${RESET}      $${signals.price.current.toFixed(2)} (${signals.price.trend})`);
  if (signals.price.sma20 !== null) {
    console.log(`  ${WHITE}SMA20:${RESET}          $${signals.price.sma20.toFixed(2)}`);
  }
  if (signals.price.rsi14 !== null) {
    console.log(`  ${WHITE}RSI14:${RESET}          ${signals.price.rsi14.toFixed(1)}`);
  }
  // Health factor with colored zones
  const hf = signals.health.current;
  let hfDisplay: string;
  if (hf === 999) {
    hfDisplay = `${DIM}N/A (no position)${RESET}`;
  } else if (hf < 1.3) {
    hfDisplay = `${RED}${BOLD}${hf.toFixed(2)} ⚠ DANGER${RESET}`;
  } else if (hf < 1.5) {
    hfDisplay = `${YELLOW}${hf.toFixed(2)} ⚠ WARNING${RESET}`;
  } else if (hf < 2.0) {
    hfDisplay = `${WHITE}${hf.toFixed(2)}${RESET}`;
  } else {
    hfDisplay = `${GREEN}${hf.toFixed(2)} ✓ SAFE${RESET}`;
  }
  console.log(`  ${WHITE}Health Factor:${RESET}  ${hfDisplay}`);
  console.log(`  ${WHITE}Fear & Greed:${RESET}   ${signals.sentiment.fearGreedIndex} (${signals.sentiment.label})`);
  console.log(`  ${WHITE}Aave TVL:${RESET}       $${(signals.tvl.aaveTVL / 1e9).toFixed(2)}B`);
  console.log(`  ${WHITE}Supply APY:${RESET}     ${signals.aave.supplyAPY.toFixed(2)}%`);
  console.log(`  ${WHITE}Borrow APY:${RESET}     ${signals.aave.borrowAPY.toFixed(2)}%`);
  const volColor = signals.volatility.regime === 'high' ? RED : signals.volatility.regime === 'medium' ? YELLOW : GREEN;
  const volValue = signals.volatility.current !== null ? signals.volatility.current.toFixed(2) + '%' : 'N/A';
  console.log(`  ${WHITE}Volatility:${RESET}     ${volColor}${volValue} (${signals.volatility.regime})${RESET}`);
}

export function logDecision(decision: AgentDecision, safetyOverride: boolean): void {
  const actionColors: Record<string, string> = {
    OPEN_POSITION: GREEN,
    INCREASE: GREEN,
    DECREASE: YELLOW,
    CLOSE: RED,
    HOLD: DIM,
  };
  const color = actionColors[decision.action] || WHITE;
  const prefix = safetyOverride ? `${RED}⚠ SAFETY OVERRIDE${RESET} ` : '';
  console.log(
    `${DIM}[${timestamp()}]${RESET} ${prefix}${BOLD}${color}${decision.action}${RESET}` +
    ` | Confidence: ${decision.confidence.toFixed(2)}` +
    ` | ${decision.reasoning}`
  );
  if (decision.parameters?.targetLeverage) {
    console.log(`  ${DIM}Target leverage: ${decision.parameters.targetLeverage}x${RESET}`);
  }
}

export function logExecution(result: ExecutionResult): void {
  const icon = result.success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`${DIM}[${timestamp()}]${RESET} ${icon} EXECUTION: ${result.action}`);
  for (const step of result.steps) {
    const stepIcon = step.success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${stepIcon} ${step.operation}: ${step.amount} (tx: ${step.hash.slice(0, 10)}...)`);
    if (step.error) {
      console.log(`    ${RED}Error: ${step.error}${RESET}`);
    }
  }
  if (result.disbursement) {
    console.log(
      `  ${MAGENTA}💰 PROFIT DISBURSEMENT: ${formatWeth(BigInt(result.disbursement.amountWeth))} WETH` +
      ` → ${result.disbursement.treasuryAddress.slice(0, 10)}...` +
      ` (tx: ${result.disbursement.txHash.slice(0, 10)}...)${RESET}`
    );
  }
  if (result.error) {
    console.log(`  ${RED}Error: ${result.error}${RESET}`);
  }
}

export function logPosition(pos: PositionState): void {
  console.log(`${DIM}[${timestamp()}]${RESET} ${CYAN}POSITION${RESET}`);
  if (!pos.isOpen) {
    console.log(`  ${DIM}No open position${RESET}`);
    console.log(`  ${WHITE}Cycles: ${pos.cycleCount} | Actions: ${pos.actionCount}${RESET}`);
    return;
  }
  const pnlColor = pos.unrealizedPnlUsd >= 0 ? GREEN : RED;
  const pnlSign = pos.unrealizedPnlUsd >= 0 ? '+' : '';
  console.log(`  ${WHITE}Collateral:${RESET}  ${formatWeth(pos.collateralWeth)} WETH`);
  console.log(`  ${WHITE}Debt:${RESET}        ${formatUsdt(pos.debtUsdt)} USDT0`);
  console.log(`  ${WHITE}Leverage:${RESET}    ${pos.leverageRatio.toFixed(2)}x`);
  console.log(`  ${WHITE}Health:${RESET}      ${pos.healthFactor.toFixed(2)}`);
  console.log(`  ${WHITE}Entry:${RESET}       $${pos.entryPrice.toFixed(2)}`);
  console.log(`  ${WHITE}Current:${RESET}     $${pos.currentPrice.toFixed(2)}`);
  console.log(`  ${pnlColor}P&L:${RESET}         ${pnlColor}${pnlSign}$${pos.unrealizedPnlUsd.toFixed(2)} (${pnlSign}${pos.unrealizedPnlPct.toFixed(2)}%)${RESET}`);
  console.log(`  ${WHITE}Cycles: ${pos.cycleCount} | Actions: ${pos.actionCount}${RESET}`);
}

export function logError(error: unknown, context: string): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`${DIM}[${timestamp()}]${RESET} ${RED}ERROR [${context}]: ${msg}${RESET}`);
  if (error instanceof Error && error.stack) {
    console.error(`${DIM}${error.stack.split('\n').slice(1, 4).join('\n')}${RESET}`);
  }
}

export function logCycleSeparator(cycleNumber: number): void {
  console.log(`\n${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`${BOLD}${WHITE}Cycle ${cycleNumber}${RESET}`);
}

export function logShutdown(position: PositionState): void {
  const pnlColor = position.realizedPnlUsd >= 0 ? GREEN : RED;
  const pnlSign = position.realizedPnlUsd >= 0 ? '+' : '';
  const gasEth = (Number(position.totalGasUsed) / 1e18).toFixed(6);

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║           SESSION SUMMARY                     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╠══════════════════════════════════════════════╣${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Cycles:${RESET}           ${String(position.cycleCount).padStart(20)}  ${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Actions Taken:${RESET}    ${String(position.actionCount).padStart(20)}  ${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Position:${RESET}         ${(position.isOpen ? 'OPEN' : 'CLOSED').padStart(20)}  ${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Realized P&L:${RESET}     ${pnlColor}${(pnlSign + '$' + position.realizedPnlUsd.toFixed(2)).padStart(20)}${RESET}  ${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Closed Positions:${RESET} ${String(position.realizedPnlCount).padStart(20)}  ${CYAN}║${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Gas Used:${RESET}         ${(gasEth + ' ETH').padStart(20)}  ${CYAN}║${RESET}`);
  if (position.isOpen) {
    const uPnlColor = position.unrealizedPnlUsd >= 0 ? GREEN : RED;
    const uPnlSign = position.unrealizedPnlUsd >= 0 ? '+' : '';
    console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Unrealized P&L:${RESET}   ${uPnlColor}${(uPnlSign + '$' + position.unrealizedPnlUsd.toFixed(2)).padStart(20)}${RESET}  ${CYAN}║${RESET}`);
    console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Leverage:${RESET}         ${(position.leverageRatio.toFixed(2) + 'x').padStart(20)}  ${CYAN}║${RESET}`);
    console.log(`${BOLD}${CYAN}║${RESET}  ${WHITE}Health Factor:${RESET}    ${position.healthFactor.toFixed(2).padStart(20)}  ${CYAN}║${RESET}`);
  }
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);
}
