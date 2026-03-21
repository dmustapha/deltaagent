// File: test/mock-llm.ts
// This file documents the mock behavior embedded in ai-brain.ts.
// The mock is activated by setting USE_MOCK_LLM=true in .env.
//
// Mock decision logic:
// 1. If health factor < 1.3 → CLOSE (safety override, same as real)
// 2. If no position open:
//    - Sentiment > 20 → OPEN_POSITION at 1.5x (confidence 0.80)
//    - Sentiment ≤ 20 → HOLD (confidence 0.70)
// 3. If position open:
//    - P&L > +5% → CLOSE (take profit, confidence 0.85)
//    - P&L < -5% → CLOSE (cut loss, confidence 0.90)
//    - Otherwise → HOLD (confidence 0.65)
//
// Usage:
//   Set USE_MOCK_LLM=true in .env
//   Run: npm start
//   Mock decisions appear in terminal with "Mock:" prefix in reasoning
//
// To switch to real Groq:
//   Set USE_MOCK_LLM=false (or remove the variable)
//   Ensure GROQ_API_KEY is set
