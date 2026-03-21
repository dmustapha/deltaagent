#!/bin/bash
# File: scripts/fund-demo.sh
# Fund the DeltaAgent demo wallet on an Anvil Arbitrum fork.
#
# GOTCHA: anvil_setBalance is broken on Arbitrum forks (issue #4786).
# We use whale impersonation + ERC-20 transfers instead.
#
# Usage:
#   1. Start Anvil: anvil --fork-url $ARB_RPC_URL --chain-id 42161 --block-time 1
#   2. Run this script: bash scripts/fund-demo.sh
#
# Prerequisites:
#   - SEED_PHRASE set in .env (same as agent uses)
#   - Anvil running at localhost:8545

set -euo pipefail

RPC_URL="${RPC_URL:-http://localhost:8545}"
WETH_ADDRESS="0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
GMX_VAULT="0x489ee077994B6658eAfA855C308275EAd8097C4A"
FUND_AMOUNT_WETH="10000000000000000000" # 10 WETH (18 decimals)
FUND_AMOUNT_ETH="10ether"                # 10 ETH for gas

# Derive wallet address from seed phrase
# Anvil default account 0 private key (for gas funding)
ANVIL_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Get the agent's wallet address from seed phrase
# The WDK will derive the same address from this seed
WALLET_ADDRESS="${WALLET_ADDRESS:?Set WALLET_ADDRESS to the WDK-derived address}"

echo "╔════════════════════════════════════════╗"
echo "║       DELTAAGENT DEMO FUNDER          ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "RPC:    $RPC_URL"
echo "Wallet: $WALLET_ADDRESS"
echo ""

# Step 1: Fund native ETH for gas
# NOTE: cast send --value doesn't update native balance correctly on Arbitrum forks.
# anvil_setBalance works reliably for native ETH.
echo "[1/3] Funding native ETH for gas..."
cast rpc anvil_setBalance "$WALLET_ADDRESS" "0x8AC7230489E80000" --rpc-url $RPC_URL > /dev/null 2>&1 || { echo "ERROR: ETH gas funding failed"; exit 1; }
echo "  ✓ Set 10 ETH balance on wallet"

# Step 2: Wrap ETH → WETH by calling WETH.deposit() with value
# Simpler than whale impersonation — wallet already has ETH from Anvil account
echo "[2/3] Wrapping 10 ETH → WETH..."
cast send \
  --private-key $ANVIL_PK \
  --rpc-url $RPC_URL \
  "$WETH_ADDRESS" \
  "deposit()" \
  --value $FUND_AMOUNT_WETH \
  > /dev/null 2>&1 || { echo "ERROR: WETH deposit failed"; exit 1; }

# Step 3: Transfer WETH from Anvil account to agent wallet
echo "[3/3] Transferring 10 WETH to agent wallet..."
cast send \
  --private-key $ANVIL_PK \
  --rpc-url $RPC_URL \
  "$WETH_ADDRESS" \
  "transfer(address,uint256)" \
  "$WALLET_ADDRESS" \
  "$FUND_AMOUNT_WETH" \
  > /dev/null 2>&1 || { echo "ERROR: WETH transfer failed"; exit 1; }

echo "  ✓ Wrapped and transferred 10 WETH to wallet"

# Verify balances
echo ""
echo "Verifying balances..."
ETH_BALANCE=$(cast balance "$WALLET_ADDRESS" --rpc-url $RPC_URL)
WETH_BALANCE=$(cast call "$WETH_ADDRESS" "balanceOf(address)(uint256)" "$WALLET_ADDRESS" --rpc-url $RPC_URL)
echo "  ETH:  $ETH_BALANCE"
echo "  WETH: $WETH_BALANCE"
echo ""
echo "✓ Demo wallet funded. Ready to run: npm start"
