// File: src/wdk-setup.ts

import WDK from '@tetherto/wdk';
import type { IWalletAccountWithProtocols } from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import AaveLendingProtocol from '@tetherto/wdk-protocol-lending-aave-evm';
import VeloraSwapProtocol from '@tetherto/wdk-protocol-swap-velora-evm';
import { BitfinexPricingClient } from '@tetherto/wdk-pricing-bitfinex-http';
import type { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import { config, clearSeedPhrase } from './config.js';

const BLOCKCHAIN = 'evm';

// WDK instance — initialized once, reused everywhere
let wdkInstance: WDK | null = null;
let pricingInstance: BitfinexPricingClient | null = null;

/**
 * Initialize WDK with modular registration pattern.
 * Returns the WDK instance.
 *
 * Actual API (differs from docs):
 *   new WDK(seed)                                       — raw string, not object
 *   registerWallet(blockchain, Manager, { provider })    — 'provider' not 'rpcUrl'
 *   registerProtocol(blockchain, label, Protocol)        — no config needed for Aave
 */
export async function initWdk(): Promise<WDK> {
  if (wdkInstance) return wdkInstance;

  const wdk = new WDK(config.seedPhrase);

  wdk.registerWallet(BLOCKCHAIN, WalletManagerEvm, {
    provider: config.rpcUrl,
  });

  wdk.registerProtocol(BLOCKCHAIN, 'aave', AaveLendingProtocol, undefined);

  wdk.registerProtocol(BLOCKCHAIN, 'velora', VeloraSwapProtocol, undefined);

  wdkInstance = wdk;
  clearSeedPhrase();
  return wdk;
}

/**
 * Get Bitfinex pricing client (standalone — NOT registered through WDK).
 */
export function getPricingClient(): BitfinexPricingClient {
  if (!pricingInstance) {
    pricingInstance = new BitfinexPricingClient();
  }
  return pricingInstance;
}

/**
 * Get the wallet address from the WDK account.
 * Must call initWdk() first.
 */
export async function getWalletAddress(wdk: WDK): Promise<string> {
  const account = await wdk.getAccount(BLOCKCHAIN);
  return account.getAddress();
}

/**
 * Get the Aave lending module from the WDK account.
 */
export async function getAaveLending(wdk: WDK): Promise<AaveLendingProtocol> {
  const account = await wdk.getAccount(BLOCKCHAIN);
  return account.getLendingProtocol('aave') as unknown as AaveLendingProtocol;
}

/**
 * Get the Velora swap module from the WDK account.
 */
export async function getVeloraSwap(wdk: WDK): Promise<VeloraSwapProtocol> {
  const account = await wdk.getAccount(BLOCKCHAIN);
  return account.getSwapProtocol('velora') as unknown as VeloraSwapProtocol;
}

/**
 * Get the account for direct transfers (profit disbursement).
 * The account itself has sendTransaction() and transfer().
 */
export async function getAccount(wdk: WDK): Promise<IWalletAccountWithProtocols> {
  return wdk.getAccount(BLOCKCHAIN);
}

/**
 * Direct Uniswap V3 swap via SwapRouter.exactInputSingle.
 * Fallback for when Velora DEX is blacklisted.
 * Encodes calldata manually — no external router SDK dependency.
 */
export async function uniswapSwap(
  wdk: WDK,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint
): Promise<{ hash: string; amountOut: bigint }> {
  const account = await getAccount(wdk) as unknown as WalletAccountEvm;
  const router = config.addresses.uniswapRouter;

  // Approve router to spend tokenIn
  await account.approve({ token: tokenIn, spender: router, amount: amountIn });

  const walletAddress = await account.getAddress();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const fee = 3000n; // 0.3% Uniswap V3 fee tier

  // ABI-encode exactInputSingle params as packed uint256 words
  const padAddr = (a: string) => a.toLowerCase().replace('0x', '').padStart(64, '0');
  const padUint = (n: bigint) => n.toString(16).padStart(64, '0');

  // Selector: exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
  const calldata = '0x414bf389'
    + padAddr(tokenIn)
    + padAddr(tokenOut)
    + padUint(fee)
    + padAddr(walletAddress)
    + padUint(deadline)
    + padUint(amountIn)
    + padUint(minAmountOut)
    + padUint(0n); // sqrtPriceLimitX96 = 0 (no limit)

  const txHash = await account.sendTransaction({ to: router, data: calldata, value: 0n });
  return { hash: typeof txHash === 'string' ? txHash : txHash.hash, amountOut: minAmountOut };
}

/**
 * Query on-chain nonce via eth_getTransactionCount.
 * Bypasses ethers NonceManager cache to get the real pending nonce.
 */
async function getOnChainNonce(address: string): Promise<number> {
  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, 'pending'],
      id: 1,
    }),
  });
  const json = (await res.json()) as { result: string };
  return parseInt(json.result, 16);
}

/**
 * Raw approve + Aave supply via account.sendTransaction() with explicit nonces.
 * Bypasses account.approve() entirely to avoid ethers NonceManager desync
 * that occurs after uniswapSwap sends txns through the same signer.
 *
 * ERC-20 approve(address spender, uint256 amount) — Selector: 0x095ea7b3
 * Aave V3 Pool.supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) — Selector: 0x617ba037
 */
export async function rawApproveAndSupply(
  wdk: WDK,
  token: string,
  amount: bigint
): Promise<{ hash: string }> {
  const account = await getAccount(wdk) as unknown as WalletAccountEvm;
  const pool = config.addresses.aavePool;
  const walletAddress = await account.getAddress();

  const padAddr = (a: string) => a.toLowerCase().replace('0x', '').padStart(64, '0');
  const padUint = (n: bigint) => n.toString(16).padStart(64, '0');

  // Query real on-chain nonce (bypasses stale NonceManager cache)
  const baseNonce = await getOnChainNonce(walletAddress);

  // Step 1: Raw ERC-20 approve (nonce = baseNonce)
  const approveData = '0x095ea7b3'
    + padAddr(pool)
    + padUint(amount);

  await account.sendTransaction({
    to: token,
    data: approveData,
    value: 0n,
    nonce: baseNonce,
  });

  // Step 2: Raw Aave supply (nonce = baseNonce + 1)
  const supplyData = '0x617ba037'
    + padAddr(token)
    + padUint(amount)
    + padAddr(walletAddress)
    + padUint(0n); // referralCode = 0

  const txHash = await account.sendTransaction({
    to: pool,
    data: supplyData,
    value: 0n,
    nonce: baseNonce + 1,
  });

  return { hash: typeof txHash === 'string' ? txHash : txHash.hash };
}
