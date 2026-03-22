import { useState } from 'react';
import type React from 'react';
import type { DashboardState } from '../../types';
import { timeAgo } from '../../utils/format';

interface ActivityTabProps {
  currentDecision: DashboardState['currentDecision'];
  decisionHistory: DashboardState['decisionHistory'];
  cycleNumber: number;
  transactions: DashboardState['transactions'];
}

/* ── Shared helpers (deduplicated from DecisionsTab + HistoryTab) ── */

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

/* ── Decision helpers ── */

function isLowConfidence(confidence: number): boolean {
  return confidence < 60;
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const low = isLowConfidence(confidence);
  const fillStyle: React.CSSProperties = low
    ? {
        width: `${confidence}%`,
        background: 'linear-gradient(90deg, oklch(0.55 0.20 25), var(--danger))',
        boxShadow: '0 0 6px oklch(0.62 0.24 25 / 0.30)',
      }
    : { width: `${confidence}%` };

  return (
    <div className="decision-confidence" aria-label={`Confidence ${confidence}%`}>
      <div className="conf-track" aria-hidden="true">
        <div className="conf-fill" style={fillStyle} />
      </div>
      <span className="conf-pct font-mono" aria-hidden="true">{confidence}%</span>
    </div>
  );
}

interface DecisionRowData {
  cycle: number;
  action: string;
  confidence: number;
  reasoning: string;
  timestamp: number;
  isLatest: boolean;
}

function DecisionRow({ row }: { row: DecisionRowData }) {
  const rowClass = row.isLatest ? 'decision-row decision-row--latest' : 'decision-row';
  const label = `Cycle ${row.cycle}: ${actionDisplayLabel(row.action)}, ${row.confidence}% confidence, ${timeAgo(row.timestamp)}`;

  return (
    <article className={rowClass} role="listitem" aria-label={label}>
      {row.isLatest && <div className="shimmer-overlay" aria-hidden="true" />}
      <span className="decision-cycle font-mono" aria-hidden="true">#{row.cycle}</span>
      <span
        className={`decision-action ${actionDisplayClass(row.action)}`}
        aria-label={`Action: ${actionDisplayLabel(row.action)}`}
      >
        {actionDisplayLabel(row.action)}
      </span>
      <ConfidenceBar confidence={row.confidence} />
      <span className="decision-reason">&ldquo;{row.reasoning}&rdquo;</span>
      <span className="decision-time font-mono">{timeAgo(row.timestamp)}</span>
    </article>
  );
}

function buildDecisionList(
  current: DashboardState['currentDecision'],
  history: DashboardState['decisionHistory'],
  cycleNumber: number,
): DecisionRowData[] {
  const rows: DecisionRowData[] = [];

  if (current.action) {
    rows.push({
      cycle: cycleNumber,
      action: current.action,
      confidence: Math.round(current.confidence <= 1 ? current.confidence * 100 : current.confidence),
      reasoning: current.reasoning,
      timestamp: current.timestamp,
      isLatest: true,
    });
  }

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  for (const entry of sorted) {
    rows.push({
      cycle: entry.cycle,
      action: entry.action,
      confidence: Math.round(entry.confidence <= 1 ? entry.confidence * 100 : entry.confidence),
      reasoning: entry.reasoning,
      timestamp: entry.timestamp,
      isLatest: false,
    });
  }

  return rows;
}

/* ── Transaction helpers ── */

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

/* ── Performance chart ── */

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

/* ── Accordion section header ── */

function SectionHeader({ title, count, isOpen, onToggle }: { title: string; count: number; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className="activity-section-header" onClick={onToggle} aria-expanded={isOpen}>
      <span>{title}</span>
      <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{count}</span>
      <svg className={`chevron ${isOpen ? 'chevron--open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  );
}

/* ── Main export ── */

export function ActivityTab({ currentDecision, decisionHistory, cycleNumber, transactions }: ActivityTabProps) {
  const [openSection, setOpenSection] = useState<'decisions' | 'transactions'>('decisions');

  const decisionRows = buildDecisionList(currentDecision, decisionHistory, cycleNumber);

  return (
    <div role="tabpanel" aria-labelledby="tab-activity" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Activity</h2>
      <p className="tab-subtitle reveal-up delay-1">
        AI decisions and on-chain transactions — the full audit trail of your agent's actions.
      </p>

      <SectionHeader
        title="AI Decisions"
        count={decisionRows.length}
        isOpen={openSection === 'decisions'}
        onToggle={() => setOpenSection(openSection === 'decisions' ? 'transactions' : 'decisions')}
      />
      {openSection === 'decisions' && (
        <div className="activity-section-body">
          <div className="decision-legend reveal-up delay-1" aria-label="Decision action legend">
            <span className="legend-item"><span className="pill pill-muted">HOLD</span> Maintain current position</span>
            <span className="legend-item"><span className="pill pill-success">INCREASE</span> Add collateral or increase leverage</span>
            <span className="legend-item"><span className="pill pill-danger">DECREASE</span> Reduce exposure or repay debt</span>
            <span className="legend-item"><span className="pill" style={{ background: 'oklch(0.72 0.14 175 / 0.12)', color: 'var(--accent-teal)', borderColor: 'oklch(0.72 0.14 175 / 0.28)' }}>OPEN</span> Open a new leveraged position</span>
            <span className="legend-item"><span className="pill" style={{ background: 'oklch(0.82 0.16 80 / 0.12)', color: 'var(--accent-gold)', borderColor: 'oklch(0.82 0.16 80 / 0.28)' }}>CLOSE</span> Close position entirely</span>
          </div>

          {decisionRows.length === 0 ? (
            <div className="card card--gradient-border reveal-up delay-1" style={{ textAlign: 'center', padding: '60px 32px' }}>
              <div className="font-mono" style={{ fontSize: 48, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 16 }}>
                --
              </div>
              <div style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
                No Decisions Yet
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                The agent has not completed any decision cycles.
              </div>
            </div>
          ) : (
            <div className="decision-list reveal-up delay-1" role="list" aria-label="Decision history">
              {decisionRows.map((row, i) => (
                <DecisionRow key={`${row.cycle}-${row.timestamp}-${i}`} row={row} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="activity-section-divider" />

      <SectionHeader
        title="Transactions"
        count={transactions.length}
        isOpen={openSection === 'transactions'}
        onToggle={() => setOpenSection(openSection === 'transactions' ? 'decisions' : 'transactions')}
      />
      {openSection === 'transactions' && (
        <div className="activity-section-body">
          <TransactionTable transactions={transactions} />
          <PerformanceChart history={decisionHistory} />
        </div>
      )}
    </div>
  );
}
