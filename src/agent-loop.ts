// File: src/agent-loop.ts

import type { CycleResult, AgentDecision } from './types.js';
import { config } from './config.js';
import { fetchAllSignals } from './signal-aggregator.js';
import { analyze, getTokenUsage } from './ai-brain.js';
import { execute } from './execution-engine.js';
import {
  getPosition,
  updatePosition,
  recordCycle,
  setEntryPrice,
  closePosition,
  incrementActions,
  incrementCycleCount,
} from './position-tracker.js';
import {
  logCycleSeparator,
  logSignals,
  logDecision,
  logExecution,
  logPosition,
  logError,
  logShutdown,
} from './logger.js';
import type WDK from '@tetherto/wdk';
import { recordTransaction } from './state-collector.js';

let running = false;
let paused = false;
let isProcessing = false;
let cycleCount = 0;

// Circuit breaker (Fix #7): pause execution after repeated failures
const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_CYCLES = 5;
let consecutiveFailures = 0;
let cooldownRemaining = 0;

/**
 * Start the agent loop. Runs until stop() is called or maxCycles reached.
 */
export async function start(wdk: WDK): Promise<void> {
  running = true;
  cycleCount = 0;

  while (running && cycleCount < config.agent.maxCycles) {
    if (paused) {
      await new Promise((resolve) => setTimeout(resolve, config.agent.cycleIntervalMs));
      continue;
    }
    const startTime = Date.now();
    await runCycle(wdk);
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, config.agent.cycleIntervalMs - elapsed);

    if (running && cycleCount < config.agent.maxCycles) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Clean shutdown
  const finalPosition = getPosition();
  logShutdown(finalPosition);
}

/**
 * Stop the agent loop gracefully.
 */
export function stop(): void {
  running = false;
}

/**
 * Run a single analysis→decide→execute cycle.
 */
async function runCycle(wdk: WDK): Promise<void> {
  cycleCount++;
  logCycleSeparator(cycleCount);

  try {
    // Track cycle count in position state (once per cycle, not per updatePosition call)
    incrementCycleCount();

    // 1. Update position from live Aave data FIRST (stale data = stale safety override)
    const position = await updatePosition(wdk);

    // 2. Fetch all signals
    const signals = await fetchAllSignals(wdk);
    logSignals(signals);

    // 3. Safety override: health factor < min → force CLOSE, bypass LLM (only if emergencyExit enabled)
    let decision: AgentDecision;
    let safetyOverride = false;

    if (config.agent.emergencyExit && position.isOpen && position.healthFactor < config.agent.minHealthFactor) {
      decision = {
        action: 'CLOSE',
        reasoning: `Health factor ${position.healthFactor.toFixed(2)} below safety threshold ${config.agent.minHealthFactor}`,
        confidence: 0.99,
      };
      safetyOverride = true;
    } else {
      // 4. AI Brain analysis
      isProcessing = true;
      try {
        decision = await analyze(signals, position, cycleCount);
      } finally {
        isProcessing = false;
      }
    }

    // 4a. Volatility gate: skip new positions if volatility exceeds limit
    if (decision.action === 'OPEN_POSITION' && signals.volatility.current !== null && signals.volatility.current > config.agent.volatilityLimit) {
      decision = { ...decision, action: 'HOLD', reasoning: `Volatility ${signals.volatility.current.toFixed(2)} exceeds limit ${config.agent.volatilityLimit}` };
    }

    logDecision(decision, safetyOverride);

    // 5. Circuit breaker: skip execution during cooldown
    let executionResult = null;
    if (cooldownRemaining > 0) {
      cooldownRemaining--;
      console.warn(`[Agent] Circuit breaker active — ${cooldownRemaining} cooldown cycles remaining. Skipping execution.`);
    } else if (decision.action !== 'HOLD' && decision.confidence >= config.agent.minConfidence) {
      // Validate: don't OPEN if already open, don't CLOSE if not open
      if (decision.action === 'OPEN_POSITION' && position.isOpen) {
        decision = { ...decision, action: 'HOLD', reasoning: 'Position already open, treating as HOLD' };
        logDecision(decision, false);
      } else if (
        (decision.action === 'CLOSE' || decision.action === 'DECREASE' || decision.action === 'INCREASE') &&
        !position.isOpen
      ) {
        decision = { ...decision, action: 'HOLD', reasoning: 'No position open, treating as HOLD' };
        logDecision(decision, false);
      } else {
        executionResult = await execute(wdk, decision, position);
        logExecution(executionResult);

        // Record transaction for dashboard
        if (executionResult.steps.length > 0) {
          for (const step of executionResult.steps) {
            recordTransaction({
              cycle: cycleCount,
              action: `${decision.action}:${step.operation}`,
              details: `${step.operation} ${step.amount}`,
              txHash: step.hash,
              status: step.success ? 'success' : 'failed',
              timestamp: Date.now(),
              triggeredBy: safetyOverride ? 'safety' : 'ai',
            });
          }
        }

        if (executionResult.success) {
          consecutiveFailures = 0; // Reset circuit breaker on success
          incrementActions(executionResult.gasUsed);

          // Track position lifecycle events
          if (decision.action === 'OPEN_POSITION') {
            setEntryPrice(signals.price.current);
          } else if (decision.action === 'INCREASE') {
            // Keep original entry price on INCREASE — don't overwrite with current price
          } else if (decision.action === 'CLOSE') {
            // Use full realized P&L, not disbursement amount (which is only 10% of profit)
            const realizedPnl = executionResult.disbursement?.realizedPnlUsd
              ?? position.unrealizedPnlUsd;
            closePosition(realizedPnl);
          }
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            cooldownRemaining = COOLDOWN_CYCLES;
            console.warn(`[Agent] Circuit breaker TRIPPED: ${consecutiveFailures} consecutive failures. Cooling down for ${COOLDOWN_CYCLES} cycles.`);
          }

          if (executionResult.partialClose) {
            console.warn(`[Agent] Close partially completed (${executionResult.steps.length} steps). Will retry next cycle.`);
          }
        }
      }
    }

    // 6. Refresh position after execution
    const updatedPosition = await updatePosition(wdk);
    logPosition(updatedPosition);

    // 7. Record cycle
    const cycleResult: CycleResult = {
      cycleNumber: cycleCount,
      timestamp: Date.now(),
      signals,
      decision,
      execution: executionResult,
      position: updatedPosition,
      safetyOverride,
    };
    recordCycle(cycleResult);

    // 8. Log token usage periodically
    if (cycleCount % 5 === 0) {
      const usage = getTokenUsage();
      console.log(`  Token usage: ${usage.used}/${usage.limit}`);
    }
  } catch (error) {
    logError(error, `cycle-${cycleCount}`);
    // Don't crash the loop — next cycle may recover
  }
}

export function getAgentStatus() {
  return { running, paused, cycleCount, consecutiveFailures, cooldownRemaining, isProcessing };
}

export function pauseAgent(): void { paused = true; }
export function resumeAgent(): void { paused = false; }
export function stopAgent(): void { running = false; }
