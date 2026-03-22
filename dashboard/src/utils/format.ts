export function truncateAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

export function formatUsd(value: number): string {
  if (Math.abs(value) >= 1e9) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${(Math.abs(value) / 1e9).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1e6) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${(Math.abs(value) / 1e6).toFixed(2)}M`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a raw wei string (18 decimals) to human-readable ETH. */
export function formatWei18(raw: string, decimals = 3): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return '0';
  return (n / 1e18).toFixed(decimals);
}

/** Format a raw micro-unit string (6 decimals) to human-readable token amount. */
export function formatWei6(raw: string, decimals = 2): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return '0';
  return (n / 1e6).toFixed(decimals);
}

export function actionColor(action: string): string {
  switch (action) {
    case 'OPEN_POSITION': return 'var(--accent-teal)';
    case 'INCREASE': return 'var(--success)';
    case 'DECREASE': return 'var(--accent-gold-dim)';
    case 'CLOSE': return 'var(--danger)';
    case 'HOLD': return 'var(--text-muted)';
    default: return 'var(--text-muted)';
  }
}
