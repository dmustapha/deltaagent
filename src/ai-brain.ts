// File: src/ai-brain.ts

import Groq from 'groq-sdk';
import type { MarketSignals, AgentDecision, PositionState, AgentAction } from './types.js';
import { config } from './config.js';

const groq = new Groq({ apiKey: config.groqApiKey });

// Token budget tracking (resets each process restart — tracks session, not calendar day)
let totalTokensUsed = 0;
const SESSION_TOKEN_LIMIT = 100_000;
const TOKEN_WARN_THRESHOLD = 80_000;

// System prompt — ~340 tokens, tuned from PRD Appendix A
const SYSTEM_PROMPT = `You are DeltaAgent, an autonomous DeFi agent managing a leveraged ETH long position on Aave V3 via Arbitrum. You receive real-time market signals and must decide the optimal action.

RULES:
- Never exceed 3.0x leverage
- If health factor < 1.3: ALWAYS return CLOSE regardless of other signals
- If health factor < 1.5: strongly prefer DECREASE
- Confidence must be 0.0-1.0. Actions below 0.6 confidence are ignored (treated as HOLD)
- Reasoning must be ≤30 words explaining the key factor driving your decision

SIGNALS YOU RECEIVE:
- price: current ETH/USD, trend (up/down/flat/insufficient_data), SMA20 (may be null), RSI14 (may be null)
- health: current health factor, liquidation threshold, LTV
- sentiment: Fear & Greed Index 0-100 (0=extreme fear, 100=extreme greed)
- tvl: Aave TVL in USD, 7d change (may be null)
- aave: supply APY, borrow APY, utilization

ACTIONS:
- OPEN_POSITION: No position exists, signals favor entry. Include targetLeverage (1.2-2.5).
- INCREASE: Position exists, signals favor adding leverage. Include targetLeverage.
- DECREASE: Position exists, risk elevated. Reduce leverage.
- CLOSE: Position exists, high risk or take-profit. Full unwind.
- HOLD: No action needed. Always explain why.

When signals are null or insufficient_data, weigh available signals more heavily. Never refuse to decide.`;

// Tool definition for structured output via tool_choice
const DECISION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'execute_leverage_decision',
    description: 'Execute a leverage management decision based on market analysis',
    parameters: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string' as const,
          enum: ['OPEN_POSITION', 'INCREASE', 'DECREASE', 'CLOSE', 'HOLD'],
          description: 'The trading action to execute',
        },
        reasoning: {
          type: 'string' as const,
          description: 'Max 30 words explaining the key decision factor',
        },
        confidence: {
          type: 'number' as const,
          description: 'Confidence level 0.0-1.0',
        },
        parameters: {
          type: 'object' as const,
          properties: {
            targetLeverage: {
              type: 'number' as const,
              description: 'Target leverage ratio (1.2-2.5)',
            },
          },
        },
      },
      required: ['action', 'reasoning', 'confidence'],
    },
  },
};

/**
 * Analyze market signals and return a structured trading decision.
 * Uses Groq tool_choice for schema-enforced structured output.
 */
export async function analyze(
  signals: MarketSignals,
  position: PositionState
): Promise<AgentDecision> {
  // Mock mode — return predetermined responses to save Groq tokens
  if (config.useMockLlm) {
    return getMockDecision(signals, position);
  }

  // Token budget check
  if (totalTokensUsed >= SESSION_TOKEN_LIMIT) {
    console.warn(`[AI Brain] Session token limit reached (${totalTokensUsed}/${SESSION_TOKEN_LIMIT}). Defaulting to HOLD.`);
    return holdDecision('Session token limit reached');
  }

  // Build user message with signal payload
  const userMessage = buildSignalPayload(signals, position);

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      tools: [DECISION_TOOL],
      tool_choice: { type: 'function', function: { name: 'execute_leverage_decision' } },
      temperature: 0.3,
      max_completion_tokens: 256,
    });

    // Track token usage
    const usage = completion.usage;
    if (usage) {
      totalTokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
      if (totalTokensUsed > TOKEN_WARN_THRESHOLD) {
        console.warn(`[AI Brain] Token usage warning: ${totalTokensUsed}/${SESSION_TOKEN_LIMIT}`);
      }
    }

    // Parse tool call response
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'execute_leverage_decision') {
      return holdDecision('LLM did not return expected tool call');
    }

    const args = JSON.parse(toolCall.function.arguments) as AgentDecision;
    return validateDecision(args);
  } catch (error) {
    // Retry once on transient failure
    if (isRetryableError(error)) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const retry = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          tools: [DECISION_TOOL],
          tool_choice: { type: 'function', function: { name: 'execute_leverage_decision' } },
          temperature: 0.3,
          max_completion_tokens: 256,
        });

        const usage = retry.usage;
        if (usage) {
          totalTokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
        }

        const toolCall = retry.choices[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          return validateDecision(JSON.parse(toolCall.function.arguments));
        }
      } catch {
        // Fall through to default HOLD
      }
    }

    return holdDecision('LLM unavailable');
  }
}

/**
 * Get current token usage for logging.
 */
export function getTokenUsage(): { used: number; limit: number } {
  return { used: totalTokensUsed, limit: SESSION_TOKEN_LIMIT };
}

// ─── Helpers ───

function buildSignalPayload(signals: MarketSignals, position: PositionState): string {
  return JSON.stringify({
    position: {
      isOpen: position.isOpen,
      leverage: position.isOpen ? position.leverageRatio.toFixed(2) : 'none',
      healthFactor: position.isOpen ? position.healthFactor.toFixed(2) : 'N/A',
      unrealizedPnlPct: position.isOpen ? position.unrealizedPnlPct.toFixed(2) + '%' : 'N/A',
    },
    signals: {
      price: {
        current: signals.price.current,
        trend: signals.price.trend,
        sma20: signals.price.sma20,
        rsi14: signals.price.rsi14 !== null ? Math.round(signals.price.rsi14) : null,
      },
      health: signals.health,
      sentiment: {
        index: signals.sentiment.fearGreedIndex,
        label: signals.sentiment.label,
      },
      tvl: {
        aaveUsd: Math.round(signals.tvl.aaveTVL),
        change7d: signals.tvl.tvl7dChange !== null
          ? signals.tvl.tvl7dChange.toFixed(1) + '%'
          : 'unknown',
      },
      rates: {
        supplyAPY: signals.aave.supplyAPY.toFixed(2) + '%',
        borrowAPY: signals.aave.borrowAPY.toFixed(2) + '%',
      },
    },
  });
}

function validateDecision(raw: AgentDecision): AgentDecision {
  const validActions: AgentAction[] = ['OPEN_POSITION', 'INCREASE', 'DECREASE', 'CLOSE', 'HOLD'];
  const action = validActions.includes(raw.action) ? raw.action : 'HOLD';
  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0;
  const reasoning = typeof raw.reasoning === 'string'
    ? raw.reasoning.slice(0, 150)
    : 'No reasoning provided';

  return {
    action,
    reasoning,
    confidence,
    parameters: raw.parameters,
  };
}

function holdDecision(reason: string): AgentDecision {
  return { action: 'HOLD', reasoning: reason, confidence: 0 };
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('rate limit') || msg.includes('429') || msg.includes('500') || msg.includes('timeout');
  }
  return false;
}

// ─── Mock Mode (Development) ───

/**
 * Deterministic mock responses that follow realistic trading logic.
 * Used when USE_MOCK_LLM=true to preserve Groq token budget.
 */
function getMockDecision(signals: MarketSignals, position: PositionState): AgentDecision {
  // Safety override — even mock respects health factor
  if (position.isOpen && position.healthFactor < 1.3) {
    return { action: 'CLOSE', reasoning: 'Health factor critical — emergency close', confidence: 0.99 };
  }

  if (!position.isOpen) {
    // No position: open if sentiment is not extreme fear
    if (signals.sentiment.fearGreedIndex > 20) {
      return {
        action: 'OPEN_POSITION',
        reasoning: 'Mock: Opening conservative position',
        confidence: 0.80,
        parameters: { targetLeverage: 1.5 },
      };
    }
    return { action: 'HOLD', reasoning: 'Mock: Waiting for better conditions', confidence: 0.70 };
  }

  // Position open: check P&L
  if (position.unrealizedPnlPct > 5) {
    return { action: 'CLOSE', reasoning: 'Mock: Taking profit at 5%+', confidence: 0.85 };
  }
  if (position.unrealizedPnlPct < -5) {
    return { action: 'CLOSE', reasoning: 'Mock: Cutting loss at -5%', confidence: 0.90 };
  }

  return { action: 'HOLD', reasoning: 'Mock: Position stable, holding', confidence: 0.65 };
}
