import type { DashboardState } from '../../types';
import { timeAgo } from '../../utils/format';

interface DecisionsTabProps {
  currentDecision: DashboardState['currentDecision'];
  decisionHistory: DashboardState['decisionHistory'];
  cycleNumber: number;
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

export function DecisionsTab({ currentDecision, decisionHistory, cycleNumber }: DecisionsTabProps) {
  const rows = buildDecisionList(currentDecision, decisionHistory, cycleNumber);

  return (
    <div role="tabpanel" aria-labelledby="tab-decisions" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Decision Log</h2>
      <p className="tab-subtitle reveal-up delay-1">
        Every cycle, the AI evaluates signals and decides the next move. Here's the full reasoning trail with confidence scores.
      </p>
      <div className="decision-legend reveal-up delay-1" aria-label="Decision action legend">
        <span className="legend-item"><span className="pill pill-muted">HOLD</span> Maintain current position</span>
        <span className="legend-item"><span className="pill pill-success">INCREASE</span> Add collateral or increase leverage</span>
        <span className="legend-item"><span className="pill pill-danger">DECREASE</span> Reduce exposure or repay debt</span>
        <span className="legend-item"><span className="pill" style={{ background: 'oklch(0.72 0.14 175 / 0.12)', color: 'var(--accent-teal)', borderColor: 'oklch(0.72 0.14 175 / 0.28)' }}>OPEN</span> Open a new leveraged position</span>
        <span className="legend-item"><span className="pill" style={{ background: 'oklch(0.82 0.16 80 / 0.12)', color: 'var(--accent-gold)', borderColor: 'oklch(0.82 0.16 80 / 0.28)' }}>CLOSE</span> Close position entirely</span>
      </div>

      {rows.length === 0 ? (
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
          {rows.map((row, i) => (
            <DecisionRow key={`${row.cycle}-${row.timestamp}-${i}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
