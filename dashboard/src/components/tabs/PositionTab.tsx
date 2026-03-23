import type { DashboardState } from '../../types';
import { formatUsd, formatPct, formatWei18, formatWei6 } from '../../utils/format';

interface PositionTabProps {
  position: DashboardState['position'];
}

function healthColor(hf: number): string {
  if (hf >= 2.0) return 'var(--success)';
  if (hf >= 1.5) return 'var(--accent-gold)';
  return 'var(--danger)';
}

function healthPillClass(hf: number): string {
  if (hf >= 2.0) return 'pill pill-success';
  if (hf >= 1.5) return 'pill pill-gold';
  return 'pill pill-danger';
}

function healthZoneLabel(hf: number): string {
  if (hf >= 2.0) return 'Safe zone';
  if (hf >= 1.5) return 'Caution zone';
  return 'Danger zone';
}

function ratioToPct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(Math.round((numerator / denominator) * 100), 100);
}


function safetyMarginPct(currentPrice: number, liquidationPrice: number | null): number {
  if (!liquidationPrice || currentPrice === 0) return 0;
  return Math.min(Math.round(((currentPrice - liquidationPrice) / currentPrice) * 100), 100);
}

function PositionStatusBanner({ position }: { position: DashboardState['position'] }) {
  if (!position.isOpen) {
    return (
      <div className="position-status-banner banner--info reveal-up delay-1">
        No active position. The agent is monitoring market conditions for a favorable entry.
      </div>
    );
  }

  const hf = position.healthFactor;
  if (hf < 1.5) {
    return (
      <div className="position-status-banner banner--warn reveal-up delay-1">
        Caution: health factor at {hf.toFixed(2)} is approaching the liquidation threshold.
      </div>
    );
  }

  return (
    <div className="position-status-banner banner--ok reveal-up delay-1">
      Position active since entry at {formatUsd(position.entryPrice)}. Health factor safe at {hf.toFixed(2)}.
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="card card--gradient-border reveal-up delay-1"
      style={{ textAlign: 'center', padding: '60px 32px' }}
    >
      <div
        className="font-mono"
        style={{ fontSize: 48, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 16 }}
      >
        --
      </div>
      <div style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
        No Open Position
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto' }}>
        The agent is monitoring the market and will open a position when conditions are favorable. Check the Config tab to adjust risk parameters.
      </div>
    </div>
  );
}

function HealthHero({ position }: { position: DashboardState['position'] }) {
  const hf = position.healthFactor;
  const color = healthColor(hf);

  return (
    <div className="card card--gradient-border health-hero reveal-up delay-1" style={{ marginBottom: 20 }}>
      <div className="health-label">Health Factor</div>
      <div
        className="health-value font-mono"
        style={{ color, filter: `drop-shadow(0 0 28px ${color})` }}
        aria-label={`Health factor ${hf.toFixed(2)}`}
      >
        {hf.toFixed(2)}
      </div>
      <div
        className="health-sub"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 }}
      >
        <span className={healthPillClass(hf)} aria-label={`${position.leverageRatio.toFixed(1)}x leverage`}>
          {position.leverageRatio.toFixed(1)}x Leverage
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {healthZoneLabel(hf)}, liquidation at 1.00
        </span>
      </div>
      <div className="card-helper">Your safety buffer on Aave. Below 1.5 triggers caution, below 1.3 the agent force-closes to prevent liquidation at 1.0.</div>
    </div>
  );
}

function CollateralDebtNet({ position }: { position: DashboardState['position'] }) {
  const utilPct = ratioToPct(position.debtUsd, position.collateralUsd);
  const dPct = ratioToPct(position.debtUsd, position.collateralUsd);
  const nPct = ratioToPct(position.netWorthUsd, position.collateralUsd);

  return (
    <div className="grid-3" style={{ marginBottom: 20 }}>
      <div className="card metric-card reveal-up delay-1">
        <div className="card-label">Collateral</div>
        <div className="metric-val font-mono val-gold" aria-label={`Collateral ${formatUsd(position.collateralUsd)}`}>
          {formatUsd(position.collateralUsd)}
        </div>
        <div className="metric-lbl">{formatWei18(position.collateralWeth)} WETH supplied</div>
        <div className="progress-track" style={{ marginTop: 12 }} aria-label={`Collateral utilization ${utilPct}%`}>
          <div className="progress-fill" style={{ width: `${utilPct}%` }} />
        </div>
        <div className="card-helper">Total WETH supplied to Aave as collateral backing your borrowed position.</div>
      </div>
      <div className="card metric-card reveal-up delay-2">
        <div className="card-label">Debt</div>
        <div className="metric-val font-mono pnl-neg" aria-label={`Debt ${formatUsd(position.debtUsd)}`}>
          {formatUsd(position.debtUsd)}
        </div>
        <div className="metric-lbl">{formatWei6(position.debtUsdt)} USDT borrowed</div>
        <div className="progress-track" style={{ marginTop: 12 }} aria-label={`Debt ratio ${dPct}%`}>
          <div
            className="progress-fill"
            style={{
              width: `${dPct}%`,
              background: 'linear-gradient(90deg, var(--accent-gold-dim), var(--accent-gold))',
              boxShadow: '0 0 10px oklch(0.72 0.18 80 / 0.35)',
            }}
          />
        </div>
        <div className="card-helper">USDT borrowed against your collateral. Higher debt lowers your health factor.</div>
      </div>
      <div className="card metric-card card--gradient-border reveal-up delay-3">
        <div className="card-label">Net Worth</div>
        <div
          className={`metric-val font-mono ${position.netWorthUsd >= 0 ? 'pnl-pos' : 'pnl-neg'}`}
          aria-label={`Net worth ${formatUsd(position.netWorthUsd)}`}
        >
          {formatUsd(position.netWorthUsd)}
        </div>
        <div className="metric-lbl">Collateral minus debt</div>
        <div className="progress-track" style={{ marginTop: 12 }} aria-label={`Net worth ratio ${nPct}%`}>
          <div className="progress-fill" style={{ width: `${nPct}%` }} />
        </div>
        <div className="card-helper">What you'd receive if you closed now: collateral minus outstanding debt.</div>
      </div>
    </div>
  );
}

function PriceRow({ position }: { position: DashboardState['position'] }) {
  const priceDiff = position.currentPrice - position.entryPrice;
  const priceDiffFormatted = priceDiff >= 0
    ? `+${formatUsd(priceDiff)}`
    : `-${formatUsd(Math.abs(priceDiff))}`;
  const priceDiffClass = priceDiff >= 0 ? 'pnl-pos' : 'pnl-neg';

  return (
    <div className="grid-2" style={{ marginBottom: 20 }}>
      <div className="card metric-card reveal-up delay-1">
        <div className="card-label">Entry Price</div>
        <div className="metric-val font-mono" aria-label={`Entry price ${formatUsd(position.entryPrice)}`}>
          {formatUsd(position.entryPrice)}
        </div>
        <div className="metric-lbl">ETH / USD at open</div>
        <div className="card-helper">ETH price when the position was opened. Your cost basis for P&L.</div>
      </div>
      <div className="card metric-card reveal-up delay-2">
        <div className="card-label">Current Price</div>
        <div className="metric-val font-mono" aria-label={`Current price ${formatUsd(position.currentPrice)}`}>
          {formatUsd(position.currentPrice)}
        </div>
        <div className={`metric-lbl ${priceDiffClass}`}>{priceDiffFormatted} from entry</div>
        <div className="card-helper">Live ETH/USD price driving health factor and unrealized P&L calculations.</div>
      </div>
    </div>
  );
}

function PnlSection({ position }: { position: DashboardState['position'] }) {
  const unrealizedSign = position.unrealizedPnlUsd >= 0 ? '+' : '';
  const unrealizedClass = position.unrealizedPnlUsd >= 0 ? 'pnl-pos' : 'pnl-neg';
  const realizedSign = position.realizedPnlUsd >= 0 ? '+' : '';
  const realizedClass = position.realizedPnlUsd >= 0 ? 'pnl-pos' : 'pnl-neg';

  const liqPrice = position.liquidationPrice;
  const liqDiff = liqPrice !== null ? position.currentPrice - liqPrice : null;
  const margin = safetyMarginPct(position.currentPrice, liqPrice);

  return (
    <>
      <h3 className="section-sub-title reveal-up">Profit &amp; Loss</h3>
      <div className="grid-3">
        <div className="card metric-card reveal-up delay-1">
          <div className="card-label">Unrealized</div>
          <div
            className={`metric-val font-mono ${unrealizedClass}`}
            aria-label={`Unrealized ${unrealizedSign}${formatUsd(position.unrealizedPnlUsd)}`}
          >
            {unrealizedSign}{formatUsd(position.unrealizedPnlUsd)}
          </div>
          <div className={`metric-lbl ${unrealizedClass}`}>
            {formatPct(position.unrealizedPnlPct)} from entry
          </div>
          <div className="card-helper">Paper profit or loss vs. entry price. Not locked in until the position closes.</div>
        </div>
        <div className="card metric-card reveal-up delay-2">
          <div className="card-label">Realized</div>
          <div
            className={`metric-val font-mono ${realizedClass}`}
            aria-label={`Realized ${realizedSign}${formatUsd(position.realizedPnlUsd)}`}
          >
            {realizedSign}{formatUsd(position.realizedPnlUsd)}
          </div>
          <div className="metric-lbl">Profit locked in from completed trades</div>
        </div>
        <div className="card metric-card reveal-up delay-3">
          <div className="card-label">Liquidation Price</div>
          <div
            className="metric-val font-mono pnl-neg"
            aria-label={`Liquidation price ${liqPrice !== null ? formatUsd(liqPrice) : 'N/A'}`}
          >
            {liqPrice !== null ? formatUsd(liqPrice) : '--'}
          </div>
          <div className="metric-lbl">
            {liqDiff !== null ? `-${formatUsd(Math.abs(liqDiff))} from current` : '--'}
          </div>
          {liqPrice !== null && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Safety margin</span>
                <span className="font-mono" style={{ fontSize: 11, color: margin > 30 ? 'var(--success)' : 'var(--danger)' }}>{margin}%</span>
              </div>
              <div className="progress-track" style={{ marginTop: 4 }} aria-label={`Safety margin ${margin}%`}>
                <div className="progress-fill" style={{ width: `${margin}%` }} />
              </div>
            </>
          )}
          <div className="card-helper">If ETH drops to this price, Aave liquidates your collateral to repay the debt.</div>
        </div>
      </div>
    </>
  );
}

export function PositionTab({ position }: PositionTabProps) {
  return (
    <div role="tabpanel" aria-labelledby="tab-position" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Position Overview</h2>
      <p className="tab-subtitle reveal-up delay-1">Live position on Aave V3. Health factor, collateral ratio, and P&L update every cycle.</p>
      <PositionStatusBanner position={position} />
      {!position.isOpen ? (
        <EmptyState />
      ) : (
        <>
          <HealthHero position={position} />
          <CollateralDebtNet position={position} />
          <PriceRow position={position} />
          <PnlSection position={position} />
        </>
      )}
    </div>
  );
}
