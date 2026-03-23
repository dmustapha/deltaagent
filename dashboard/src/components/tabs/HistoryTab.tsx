import type React from 'react';
import type { DashboardState } from '../../types';

interface HistoryTabProps {
  transactions: DashboardState['transactions'];
  decisionHistory: DashboardState['decisionHistory'];
}

function actionDisplayClass(action: string): string {
  const lower = action.toLowerCase();
  if (lower === 'hold') return 'action--hold';
  if (lower === 'increase') return 'action--increase';
  if (lower === 'decrease') return 'action--decrease';
  if (lower.includes('open')) return 'action--open';
  if (lower.includes('close')) return 'action--close';
  return 'action--hold';
}

function actionDisplayLabel(action: string): string {
  switch (action) {
    case 'OPEN_POSITION': return 'OPEN';
    case 'CLOSE_POSITION': return 'CLOSE';
    default: return action;
  }
}

function statusPillStyle(status: 'success' | 'failed' | 'partial'): React.CSSProperties {
  switch (status) {
    case 'success':
      return {
        background: 'oklch(0.70 0.18 145 / 0.12)',
        color: 'var(--success)',
        border: '1px solid oklch(0.70 0.18 145 / 0.28)',
      };
    case 'failed':
      return {
        background: 'oklch(0.62 0.24 25 / 0.12)',
        color: 'var(--danger)',
        border: '1px solid oklch(0.62 0.24 25 / 0.28)',
      };
    case 'partial':
      return {
        background: 'oklch(0.82 0.16 80 / 0.12)',
        color: 'var(--accent-gold)',
        border: '1px solid oklch(0.82 0.16 80 / 0.28)',
      };
  }
}

function triggeredByLabel(triggeredBy: 'ai' | 'safety' | 'user'): string {
  switch (triggeredBy) {
    case 'ai': return 'AI Agent';
    case 'safety': return 'Safety Guard';
    case 'user': return 'User';
  }
}

function truncateHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || '--';
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

function arbiscanUrl(hash: string): string {
  return `https://arbiscan.io/tx/${hash}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (isToday) return time;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

function TransactionTable({ transactions }: { transactions: DashboardState['transactions'] }) {
  const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="card reveal-up delay-1" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
      <table className="history-table" aria-label="Transaction history">
        <thead>
          <tr>
            <th scope="col">Cycle</th>
            <th scope="col">Action</th>
            <th scope="col">Details</th>
            <th scope="col">Tx Hash</th>
            <th scope="col">Status</th>
            <th scope="col">Triggered By</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--text-muted)' }}>
                No transactions recorded yet.
              </td>
            </tr>
          ) : (
            sorted.map((tx, i) => (
              <tr key={`${tx.cycle}-${tx.txHash}-${i}`}>
                <td className="font-mono">#{tx.cycle}</td>
                <td>
                  <span
                    className={actionDisplayClass(tx.action)}
                    style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}
                  >
                    {actionDisplayLabel(tx.action)}
                  </span>
                </td>
                <td style={{
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: "'DM Sans', sans-serif"
                }}>
                  {tx.details || '--'}
                </td>
                <td className="font-mono">
                  {tx.txHash ? (
                    <a
                      href={arbiscanUrl(tx.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-teal)', textDecoration: 'none' }}
                      aria-label={`View transaction ${truncateHash(tx.txHash)} on Arbiscan`}
                    >
                      {truncateHash(tx.txHash)}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>--</span>
                  )}
                </td>
                <td>
                  <span className="pill" style={statusPillStyle(tx.status)}>
                    {tx.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    title={tx.triggeredBy === 'safety' ? 'Triggered by automated safety rules (health factor or circuit breaker)' : undefined}>
                  {triggeredByLabel(tx.triggeredBy)}
                </td>
                <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                  {formatTimestamp(tx.timestamp)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function buildPerfData(history: DashboardState['decisionHistory']): { heights: string[]; isNeg: boolean[]; labels: string[] } {
  const sorted = [...history].sort((a, b) => a.cycle - b.cycle);
  const recent = sorted.slice(-20);

  if (recent.length === 0) {
    return { heights: [], isNeg: [], labels: [] };
  }

  const heights: string[] = [];
  const isNeg: boolean[] = [];

  for (const entry of recent) {
    const normalized = Math.min(Math.max(entry.confidence * 100, 10), 100);
    heights.push(`${normalized}%`);
    const negActions = ['DECREASE', 'CLOSE', 'CLOSE_POSITION'];
    isNeg.push(negActions.includes(entry.action));
  }

  const minCycle = recent[0].cycle;
  const maxCycle = recent[recent.length - 1].cycle;
  const step = Math.max(Math.floor((maxCycle - minCycle) / 5), 1);
  const labels: string[] = [];
  for (let c = minCycle; c <= maxCycle; c += step) {
    labels.push(String(c));
  }
  if (!labels.includes(String(maxCycle))) {
    labels.push(String(maxCycle));
  }

  return { heights, isNeg, labels };
}

function PerformanceChart({ history }: { history: DashboardState['decisionHistory'] }) {
  const { heights, isNeg, labels } = buildPerfData(history);

  if (heights.length === 0) {
    return null;
  }

  return (
    <>
      <h3 className="section-sub-title reveal-up">Decision Confidence</h3>
      <div
        className="card card--gradient-border perf-chart-wrap reveal-up delay-1"
        aria-label="Performance bar chart for last 20 cycles"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Last 20 cycles</span>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-teal)', display: 'inline-block' }} />
              Buy-side
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--danger)', display: 'inline-block' }} />
              Sell-side
            </span>
          </div>
        </div>
        <div className="perf-chart" role="img" aria-label="Bar chart showing cycle performance">
          {heights.map((h, i) => (
            <div
              key={i}
              className={`perf-bar ${isNeg[i] ? 'perf-bar--neg' : ''}`}
              style={{ height: h }}
            />
          ))}
        </div>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 7 }}
          aria-hidden="true"
        >
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </>
  );
}

export function HistoryTab({ transactions, decisionHistory }: HistoryTabProps) {
  return (
    <div role="tabpanel" aria-labelledby="tab-history" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Transaction History</h2>
      <p className="tab-subtitle reveal-up delay-1">Every on-chain action the agent executed. Click a hash to verify on Arbiscan.</p>
      <TransactionTable transactions={transactions} />
      <PerformanceChart history={decisionHistory} />
    </div>
  );
}
