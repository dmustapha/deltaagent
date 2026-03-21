// File: src/utils.ts

/**
 * Simple Moving Average over the last `period` values.
 * Returns null if fewer than `period` values available.
 */
export function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * Relative Strength Index using Wilder's smoothed moving average.
 * Returns null if fewer than `period + 1` values available.
 */
export function computeRSI(prices: number[], period: number): number | null {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(-(period + 1));

  // Seed with simple average over the first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = slice[i] - slice[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Apply Wilder's smoothing for remaining values
  for (let i = period + 1; i < slice.length; i++) {
    const change = slice[i] - slice[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Detect price trend from SMA20 comparison.
 */
export function detectTrend(
  currentPrice: number,
  sma20: number | null
): 'up' | 'down' | 'flat' | 'insufficient_data' {
  if (sma20 === null) return 'insufficient_data';
  const ratio = currentPrice / sma20;
  if (ratio > 1.02) return 'up';
  if (ratio < 0.98) return 'down';
  return 'flat';
}

/**
 * Convert Aave health factor from bigint (1e18 = 1.0) to number.
 * Returns 999 if healthFactor is 0 (no position) or max uint256.
 */
export function healthFactorToNumber(hf: bigint): number {
  if (hf === 0n) return 999;
  // max uint256 means infinite health (no debt)
  if (hf >= 2n ** 128n) return 999;
  return Number(hf) / 1e18;
}

/**
 * Convert Aave ray rate (1e27) to annual percentage.
 * liquidityRate and variableBorrowRate are in ray.
 */
export function rayToPercent(ray: bigint): number {
  // ray / 1e27 * 100 = ray / 1e25
  return Number(ray) / 1e25;
}

/**
 * Parse a 256-bit value from hex string at a given word index.
 * Word 0 = bytes 2..66, word 1 = bytes 66..130, etc.
 * (hex string starts with 0x, so offset by 2)
 */
export function parseUint256(hex: string, wordIndex: number): bigint {
  const start = 2 + wordIndex * 64;
  const end = start + 64;
  const slice = hex.slice(start, end);
  if (!slice || slice.length < 64) return 0n;
  return BigInt('0x' + slice);
}

/**
 * Minimal JSON-RPC eth_call via native fetch.
 * No external dependencies — avoids adding viem/ethers.
 */
export async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
      id: 1,
    }),
  });
  const json = (await response.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`eth_call failed: ${json.error.message}`);
  return json.result ?? '0x';
}

/**
 * Pad an Ethereum address to 32 bytes (left-pad with zeros).
 */
export function padAddress(address: string): string {
  return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

/**
 * Format bigint WETH (18 decimals) to human-readable string.
 * Handles negative values (e.g., unrealized P&L).
 */
export function formatWeth(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const frac = abs % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
  return `${negative ? '-' : ''}${whole}.${fracStr}`;
}

/**
 * Format bigint USDT0 (6 decimals) to human-readable string.
 * Handles negative values.
 */
export function formatUsdt(amount: bigint): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / 10n ** 6n;
  const frac = abs % 10n ** 6n;
  const fracStr = frac.toString().padStart(6, '0').slice(0, 2);
  return `${negative ? '-' : ''}${whole}.${fracStr}`;
}

/**
 * Calculate max safe WETH withdrawal from Aave without liquidation.
 * Returns the amount in WETH (18 decimals), or null if no debt (caller decides amount).
 *
 * Uses liquidationThreshold (not LTV) as the safety floor — LTV is the borrow limit,
 * liquidationThreshold is when liquidation can actually occur.
 */
export function calcMaxSafeWithdraw(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  liquidationThreshold: bigint,
  ethPriceUsd: number
): bigint | null {
  if (totalDebtBase === 0n) {
    // No debt — caller should withdraw total collateral
    return null;
  }
  // Minimum collateral to stay above liquidation (base currency, 8 decimals)
  // liquidationThreshold is in basis points (e.g. 8250 = 82.5%)
  const minCollateralBase = totalDebtBase * 10000n / liquidationThreshold;
  const excessBase = totalCollateralBase - minCollateralBase;
  if (excessBase <= 0n) return 0n;
  // 90% safety margin to account for price movement during tx
  const safeBase = excessBase * 9n / 10n;
  // Convert base (USD, 8 decimals) to WETH (18 decimals)
  const ethPriceBase = BigInt(Math.floor(ethPriceUsd * 1e8));
  if (ethPriceBase === 0n) return 0n;
  return safeBase * 10n ** 18n / ethPriceBase;
}
