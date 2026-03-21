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

let running = false;
let cycleCount = 0;

/**
 * Start the agent loop. Runs until stop() is called or maxCycles reached.
 */
export async function start(wdk: WDK): Promise<void> {
  running = true;
  cycleCount = 0;

  while (running && cycleCount < config.agent.maxCycles) {
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
    // 1. Update position from live Aave data FIRST (stale data = stale safety override)
    const position = await updatePosition(wdk);

    // 2. Fetch all signals
    const signals = await fetchAllSignals(wdk);
    logSignals(signals);

    // 3. Safety override: health factor < 1.3 → force CLOSE, bypass LLM
    let decision: AgentDecision;
    let safetyOverride = false;

    if (position.isOpen && position.healthFactor < config.agent.minHealthFactor) {
      decision = {
        action: 'CLOSE',
        reasoning: `Health factor ${position.healthFactor.toFixed(2)} below safety threshold ${config.agent.minHealthFactor}`,
        confidence: 0.99,
      };
      safetyOverride = true;
    } else {
      // 4. AI Brain analysis
      decision = await analyze(signals, position);
    }

    logDecision(decision, safetyOverride);

    // 5. Execute if confidence meets threshold and action is not HOLD
    let executionResult = null;
    if (decision.action !== 'HOLD' && decision.confidence >= config.agent.minConfidence) {
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

        if (executionResult.success) {
          incrementActions(executionResult.gasUsed);

          // Track position lifecycle events
          if (decision.action === 'OPEN_POSITION' || decision.action === 'INCREASE') {
            setEntryPrice(signals.price.current);
          } else if (decision.action === 'CLOSE') {
            closePosition();
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
