import type { DashboardState } from '../../types';
import { formatUsd } from '../../utils/format';

interface SignalsTabProps {
  signals: DashboardState['signals'];
}

function volatilityPillClass(regime: string): string {
  switch (regime.toLowerCase()) {
    case 'low': return 'pill pill-success';
    case 'high': return 'pill pill-danger';
    default: return 'pill pill-gold';
  }
}

/** Maps volatility % to gauge width: 0% → 0, 5% → 50, 10%+ → 100 */
function volatilityGaugePct(vol: number | null): number {
  if (vol === null) return 0;
  return Math.min(Math.round(vol * 10), 100);
}

function sentimentLabel(index: number): string {
  if (index <= 25) return 'Extreme Fear';
  if (index <= 45) return 'Fear';
  if (index <= 55) return 'Neutral';
  if (index <= 75) return 'Greed';
  return 'Extreme Greed';
}

function trendPctSign(trend: string): { text: string; colorClass: string } {
  const match = trend.match(/([-+]?\d+\.?\d*)/);
  if (!match) return { text: trend, colorClass: '' };
  const val = parseFloat(match[1]);
  if (trend.toLowerCase().includes('bullish') || val > 0) {
    return { text: `+${val}%`, colorClass: 'pnl-pos' };
  }
  if (trend.toLowerCase().includes('bearish') || val < 0) {
    return { text: `${val}%`, colorClass: 'pnl-neg' };
  }
  return { text: `${val}%`, colorClass: '' };
}

function trendDisplayColor(trend: string): string {
  const lower = trend.toLowerCase();
  if (lower.includes('bullish') || lower.includes('up')) return 'var(--success)';
  if (lower.includes('bearish') || lower.includes('down')) return 'var(--danger)';
  return 'var(--text-secondary)';
}

function EthPriceCard({ signals }: { signals: NonNullable<DashboardState['signals']> }) {
  const { current, trend, sma20, rsi14 } = signals.price;
  const trendInfo = trendPctSign(trend);
  const trendColor = trendDisplayColor(trend);

  return (
    <div className="card card--gradient-border signal-large reveal-left delay-1">
      <div className="card-label">ETH / USD</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div className="signal-price-main font-mono" aria-label={formatUsd(current)}>
          {formatUsd(current)}
        </div>
        {trendInfo.text && (
          <span style={{ fontSize: 14, color: trendColor }} aria-label={`Trend ${trendInfo.text}`}>
            {trendInfo.text}
          </span>
        )}
      </div>
      <div className="signal-meta-row">
        <div className="signal-meta-item">
          <div className="signal-meta-label">SMA20</div>
          <div className="signal-meta-value font-mono" aria-label={`SMA20: ${sma20 !== null ? formatUsd(sma20) : '--'}`}>
            {sma20 !== null ? formatUsd(sma20) : '--'}
          </div>
        </div>
        <div className="signal-meta-item">
          <div className="signal-meta-label">RSI 14</div>
          <div
            className="signal-meta-value font-mono"
            style={rsi14 !== null ? { color: rsi14 >= 70 ? 'var(--accent-gold)' : rsi14 <= 30 ? 'var(--danger)' : 'var(--text-primary)' } : undefined}
            aria-label={`RSI 14: ${rsi14 !== null ? Math.round(rsi14) : '--'}`}
          >
            {rsi14 !== null ? Math.round(rsi14) : '--'}
          </div>
          <div className="card-helper" style={{ marginTop: 2 }}>RSI measures momentum. 30–70 is neutral — above 70 the agent may reduce exposure, below 30 it watches for entry.</div>
        </div>
      </div>
    </div>
  );
}

function FearGreedCard({ signals }: { signals: NonNullable<DashboardState['signals']> }) {
  const { fearGreedIndex, label, priorDay, priorWeek } = signals.sentiment;

  return (
    <div
      className="card signal-large reveal-right delay-2"
      style={{
        background: 'linear-gradient(135deg, var(--bg-surface), oklch(0.16 0.03 65 / 0.80))',
        borderColor: 'oklch(0.82 0.14 80 / 0.22)',
      }}
    >
      <div className="card-label">Fear &amp; Greed Index</div>
      <div className="fg-value font-mono" aria-label={`${fearGreedIndex} out of 100`}>
        {fearGreedIndex}
        <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>/100</span>
      </div>
      <div className="fg-label">{label || sentimentLabel(fearGreedIndex)}</div>
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 7 }}>
          <span>Extreme Fear</span><span>Neutral</span><span>Extreme Greed</span>
        </div>
        <div className="progress-track" aria-label={`Sentiment gauge: ${fearGreedIndex} of 100`}>
          <div
            className="progress-fill"
            style={{
              width: `${fearGreedIndex}%`,
              background: 'linear-gradient(90deg, var(--accent-gold-dim), var(--accent-gold))',
              boxShadow: '0 0 10px oklch(0.72 0.18 80 / 0.35)',
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 18 }}>
        <span>Prior day: <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{priorDay ?? '--'}</span></span>
        <span>Prior week: <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{priorWeek ?? '--'}</span></span>
      </div>
      <div className="card-helper" style={{ marginTop: 10 }}>Composite sentiment index. Extreme fear often marks buying opportunities; extreme greed signals caution.</div>
    </div>
  );
}

function Row2Cards({ signals }: { signals: NonNullable<DashboardState['signals']> }) {
  const volPct = volatilityGaugePct(signals.volatility.current);

  return (
    <div className="grid-2">
      {/* Volatility */}
      <div className="card signal-medium reveal-up delay-1">
        <h4>Volatility</h4>
        <div
          className="font-mono"
          style={{ fontSize: 26, fontWeight: 500, color: 'var(--text-primary)' }}
          aria-label={`Volatility: ${signals.volatility.current !== null ? `${signals.volatility.current.toFixed(1)}%` : '--'}`}
        >
          {signals.volatility.current !== null ? `${signals.volatility.current.toFixed(1)}%` : '--'}
        </div>
        <div style={{ marginTop: 8 }}>
          <span className={volatilityPillClass(signals.volatility.regime)}>
            {signals.volatility.regime || '--'}
          </span>
        </div>
        <div className="progress-track" style={{ marginTop: 14 }} aria-label={`Volatility gauge: ${volPct}%`}>
          <div className="progress-fill" style={{ width: `${volPct}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
          <span>0%</span><span>5%</span><span>10%+</span>
        </div>
        <div className="card-helper">Measures ETH price swings. When volatility exceeds your configured limit, the agent pauses new positions.</div>
      </div>

      {/* Aave v3 Rates */}
      <div className="card signal-medium reveal-up delay-2">
        <h4>Aave v3 Rates</h4>
        <div className="rate-row">
          <span className="rate-label">Supply APY</span>
          <span className="font-mono rate-value pnl-pos" aria-label={`Supply APY ${signals.aave.supplyAPY.toFixed(1)}%`}>
            {signals.aave.supplyAPY.toFixed(1)}%
          </span>
        </div>
        <div className="rate-row">
          <span className="rate-label">Borrow APY</span>
          <span className="font-mono rate-value pnl-neg" aria-label={`Borrow APY ${signals.aave.borrowAPY.toFixed(1)}%`}>
            {signals.aave.borrowAPY.toFixed(1)}%
          </span>
        </div>
        <div className="rate-row">
          <span className="rate-label">Utilization</span>
          <span className="font-mono rate-value" aria-label={`Utilization ${Math.round(signals.aave.utilization)}%`}>
            {Math.round(signals.aave.utilization)}%
          </span>
        </div>
        <div className="progress-track" style={{ marginTop: 10 }} aria-label={`Utilization ${Math.round(signals.aave.utilization)}%`}>
          <div className="progress-fill" style={{ width: `${Math.round(signals.aave.utilization)}%` }} />
        </div>
        <div className="card-helper">The spread between borrow and supply APY is your carry cost. Lower utilization means cheaper borrowing.</div>
      </div>
    </div>
  );
}

function SignalSummaryRow({ signals }: { signals: NonNullable<DashboardState['signals']> }) {
  const trend = signals.price.trend;
  const fg = signals.sentiment;
  const vol = signals.volatility;

  const trendLower = trend.toLowerCase();
  const trendClass = trendLower.includes('bullish') || trendLower.includes('up') ? 'pnl-pos' :
                     trendLower.includes('bearish') || trendLower.includes('down') ? 'pnl-neg' : '';

  return (
    <div className="signal-summary-row reveal-up delay-1">
      <span className={`signal-summary-chip ${trendClass}`}>ETH {trend}</span>
      <span className="signal-summary-divider" aria-hidden="true">&middot;</span>
      <span className="signal-summary-chip">Sentiment: {fg.fearGreedIndex} ({fg.label || sentimentLabel(fg.fearGreedIndex)})</span>
      <span className="signal-summary-divider" aria-hidden="true">&middot;</span>
      <span className="signal-summary-chip">{vol.regime || '--'} Volatility</span>
    </div>
  );
}

function NoSignalsState() {
  return (
    <div className="card card--gradient-border reveal-up delay-1" style={{ textAlign: 'center', padding: '60px 32px' }}>
      <div className="font-mono" style={{ fontSize: 48, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 16 }}>
        --
      </div>
      <div style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
        No Signal Data
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
        Waiting for the agent to complete its first analysis cycle.
      </div>
    </div>
  );
}

export function SignalsTab({ signals }: SignalsTabProps) {
  return (
    <div role="tabpanel" aria-labelledby="tab-signals" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Market Signals</h2>
      <p className="tab-subtitle reveal-up delay-1">Real-time data feeding the AI's decision engine — price, sentiment, volatility, and protocol health.</p>
      {!signals ? (
        <NoSignalsState />
      ) : (
        <>
          <SignalSummaryRow signals={signals} />

          {/* Row 1: ETH Price + Fear & Greed */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <EthPriceCard signals={signals} />
            <FearGreedCard signals={signals} />
          </div>

          {/* Row 2: Volatility + Aave Rates */}
          <Row2Cards signals={signals} />
        </>
      )}
    </div>
  );
}
