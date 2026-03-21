// File: src/wdk-setup.ts

import WDK from '@tetherto/wdk';
import type { IWalletAccountWithProtocols } from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import AaveLendingProtocol from '@tetherto/wdk-protocol-lending-aave-evm';
import VeloraSwapProtocol from '@tetherto/wdk-protocol-swap-velora-evm';
import { BitfinexPricingClient } from '@tetherto/wdk-pricing-bitfinex-http';
import { config } from './config.js';

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
export async function getVeloraSwap(wdk: WDK) {
  const account = await wdk.getAccount(BLOCKCHAIN);
  return account.getSwapProtocol('velora');
}

/**
 * Get the account for direct transfers (profit disbursement).
 * The account itself has sendTransaction() and transfer().
 */
export async function getAccount(wdk: WDK): Promise<IWalletAccountWithProtocols> {
  return wdk.getAccount(BLOCKCHAIN);
}
