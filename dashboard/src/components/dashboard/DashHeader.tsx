import { useState, useEffect } from 'react';
import type { DashboardState } from '../../types';
import { truncateAddress } from '../../utils/format';

function useNextCycleCountdown(lastCycleTs: number | null, intervalMs: number): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastCycleTs || !intervalMs) return '--';

  const remaining = Math.max(0, Math.round((lastCycleTs + intervalMs - now) / 1000));
  return remaining === 0 ? 'now' : `${remaining}s`;
}

interface DashHeaderProps {
  state: DashboardState;
  onBack: () => void;
}

export function DashHeader({ state, onBack }: DashHeaderProps) {
  const statusLabel = formatStatus(state.agent.status);
  const statusColor = state.agent.status === 'running' ? 'var(--success)' : 'var(--accent-gold-dim)';
  const countdown = useNextCycleCountdown(state.agent.lastCycleTimestamp, state.agent.cycleIntervalMs);

  return (
    <header className="dash-header" role="banner">
      <div className="dash-brand" aria-label="DeltaAgent">
        <img src="/logo.png" alt="" className="dash-brand-logo" />
        DeltaAgent
      </div>
      <div className="h-divider" aria-hidden="true" />
      <div
        className="h-status"
        aria-live="polite"
        aria-label={`Agent ${statusLabel}`}
        style={{ color: statusColor }}
      >
        <div
          className="status-dot"
          aria-hidden="true"
          style={{ background: statusColor }}
        />
        <span>{statusLabel}</span>
      </div>
      <div className="h-divider" aria-hidden="true" />
      <span
        className="h-cycle font-mono"
        aria-label={`Cycle ${state.agent.cycleNumber}`}
      >
        Cycle #{state.agent.cycleNumber}
      </span>
      <div className="h-divider" aria-hidden="true" />
      <span className="h-countdown font-mono" aria-label={`Next cycle in ${countdown}`}>
        Next: {countdown}
      </span>
      <div className="h-right">
        {state.agent.mockMode && (
          <span
            className="h-pill h-pill-mock"
            aria-label="Demo mode: running with simulated data"
            title="Running with simulated data, no real transactions"
          >
            DEMO MODE
          </span>
        )}
        <span className="h-pill h-pill-chain" aria-label={`Network: ${state.wallet.chain}`}>
          {state.wallet.chain}
        </span>
        <div className="h-divider" aria-hidden="true" />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Wallet</span>
          <span
            className="h-wallet font-mono"
            aria-label={`Wallet: ${state.wallet.address}`}
            title={state.wallet.address}
          >
            {truncateAddress(state.wallet.address)}
          </span>
        </span>
        <span className="h-balance font-mono" aria-label={`${state.wallet.ethBalance} ETH`}>
          {parseFloat(state.wallet.ethBalance).toFixed(4).replace(/\.?0+$/, '')} ETH
        </span>
        <button
          className="h-back-btn"
          onClick={onBack}
          aria-label="Return to landing page"
        >
          &larr; Back
        </button>
      </div>
    </header>
  );
}

function formatStatus(status: DashboardState['agent']['status']): string {
  switch (status) {
    case 'running':  return 'Running';
    case 'paused':   return 'Paused';
    case 'stopped':  return 'Stopped';
    case 'cooldown': return 'Cooldown';
  }
}
