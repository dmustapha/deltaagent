import { useState, useRef, useCallback, useEffect } from 'react';
import type { DashboardState } from '../../types';

interface ConfigTabProps {
  config: DashboardState['config'];
  agentStatus: DashboardState['agent']['status'];
  isMockMode: boolean;
  updateConfig: (config: Record<string, unknown>) => Promise<unknown>;
  controlAgent: (action: 'pause' | 'resume' | 'stop') => Promise<unknown>;
}

function sliderFillPct(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

function useDebounced<T extends Record<string, unknown>>(
  fn: (value: T) => Promise<unknown>,
  delayMs: number,
): (value: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(value), delayMs);
    },
    [fn, delayMs],
  );
}

function RangeSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  formatValue,
  axisLabels,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  axisLabels: [string, string, string];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const displayVal = formatValue(value);
  const fillPct = sliderFillPct(value, min, max);

  return (
    <div className={`config-field${disabled ? ' config-field--disabled' : ''}`}>
      <div className="config-label-row">
        <label className="config-label-text" htmlFor={id}>{label}</label>
        <span className="config-label-val font-mono" id={`${id}-val`}>{displayVal}</span>
      </div>
      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill-pct': fillPct } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label}: ${displayVal}`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      />
      <div className="range-axis">
        <span>{axisLabels[0]}</span>
        <span>{axisLabels[1]}</span>
        <span>{axisLabels[2]}</span>
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  name,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  name: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`toggle-row${disabled ? ' config-field--disabled' : ''}`}>
      <div className="toggle-info">
        <div className="toggle-name">{name}</div>
        <div className="toggle-desc">{description}</div>
      </div>
      <label className="toggle-switch" aria-label={label}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="toggle-track" />
      </label>
    </div>
  );
}

const PRESETS = {
  conservative: { maxLeverage: 1.5, minHealthFactor: 2.0, volatilityLimit: 3, rebalanceThreshold: 10, autoRebalance: true, emergencyExit: true },
  balanced: { maxLeverage: 2.0, minHealthFactor: 1.5, volatilityLimit: 5, rebalanceThreshold: 15, autoRebalance: true, emergencyExit: true },
  aggressive: { maxLeverage: 3.0, minHealthFactor: 1.3, volatilityLimit: 8, rebalanceThreshold: 25, autoRebalance: true, emergencyExit: false },
} as const;

export function ConfigTab({ config, agentStatus, isMockMode, updateConfig, controlAgent }: ConfigTabProps) {
  const [maxLeverage, setMaxLeverage] = useState(config.maxLeverage);
  const [minHealthFactor, setMinHealthFactor] = useState(config.minHealthFactor);
  const [volatilityLimit, setVolatilityLimit] = useState(config.volatilityLimit);
  const [rebalanceThreshold, setRebalanceThreshold] = useState(config.rebalanceThreshold);
  const [autoRebalance, setAutoRebalance] = useState(config.autoRebalance);
  const [emergencyExit, setEmergencyExit] = useState(config.emergencyExit);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    setMaxLeverage(config.maxLeverage);
    setMinHealthFactor(config.minHealthFactor);
    setVolatilityLimit(config.volatilityLimit);
    setRebalanceThreshold(config.rebalanceThreshold);
    setAutoRebalance(config.autoRebalance);
    setEmergencyExit(config.emergencyExit);
  }, [config.maxLeverage, config.minHealthFactor, config.volatilityLimit, config.rebalanceThreshold, config.autoRebalance, config.emergencyExit]);

  const debouncedUpdate = useDebounced(updateConfig, 500);

  const handleLeverageChange = useCallback(
    (v: number) => {
      setMaxLeverage(v);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ maxLeverage: v });
    },
    [debouncedUpdate],
  );

  const handleMinHfChange = useCallback(
    (v: number) => {
      setMinHealthFactor(v);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ minHealthFactor: v });
    },
    [debouncedUpdate],
  );

  const handleVolatilityChange = useCallback(
    (v: number) => {
      setVolatilityLimit(v);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ volatilityLimit: v });
    },
    [debouncedUpdate],
  );

  const handleRebalanceChange = useCallback(
    (v: number) => {
      setRebalanceThreshold(v);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ rebalanceThreshold: v });
    },
    [debouncedUpdate],
  );

  const handleAutoRebalanceChange = useCallback(
    (checked: boolean) => {
      setAutoRebalance(checked);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ autoRebalance: checked });
    },
    [debouncedUpdate],
  );

  const handleEmergencyExitChange = useCallback(
    (checked: boolean) => {
      setEmergencyExit(checked);
      setSaveStatus('idle');
      setActivePreset(null);
      debouncedUpdate({ emergencyExit: checked });
    },
    [debouncedUpdate],
  );

  const applyPreset = useCallback((name: string) => {
    const p = PRESETS[name as keyof typeof PRESETS];
    if (!p) return;
    setMaxLeverage(p.maxLeverage);
    setMinHealthFactor(p.minHealthFactor);
    setVolatilityLimit(p.volatilityLimit);
    setRebalanceThreshold(p.rebalanceThreshold);
    setAutoRebalance(p.autoRebalance);
    setEmergencyExit(p.emergencyExit);
    setActivePreset(name);
    setSaveStatus('idle');
    debouncedUpdate(p);
  }, [debouncedUpdate]);

  const handlePauseResume = useCallback(() => {
    const action = agentStatus === 'paused' ? 'resume' : 'pause';
    controlAgent(action);
  }, [agentStatus, controlAgent]);

  const handleStop = useCallback(() => {
    controlAgent('stop');
  }, [controlAgent]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await updateConfig({
        maxLeverage,
        minHealthFactor,
        volatilityLimit,
        rebalanceThreshold,
        autoRebalance,
        emergencyExit,
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [updateConfig, maxLeverage, minHealthFactor, volatilityLimit, rebalanceThreshold, autoRebalance, emergencyExit]);

  const isPaused = agentStatus === 'paused';

  return (
    <div role="tabpanel" aria-labelledby="tab-config" tabIndex={0}>
      <h2 className="tab-heading reveal-up">Configuration</h2>
      <p className="tab-subtitle reveal-up delay-1">Tune the agent's risk parameters, signal thresholds, and automation rules.</p>

      {isMockMode && (
        <div className="demo-mode-banner reveal-up delay-1" role="status">
          Demo Mode — these controls show how configuration works. Connect a live agent to save real parameters.
        </div>
      )}

      <div className="config-wrap">
        {/* Risk Parameters */}
        <section className="config-section reveal-up delay-1" aria-labelledby="cfg-risk-title">
          <h3 className="config-section-title" id="cfg-risk-title">Risk Parameters</h3>
          <p className="config-section-desc">Controls how aggressively the agent manages your position.</p>
          <RangeSlider
            id="slider-leverage"
            label="Max Leverage"
            value={maxLeverage}
            min={1}
            max={5}
            step={0.1}
            formatValue={(v) => `${v.toFixed(1)}x`}
            axisLabels={['1.0x', '3.0x', '5.0x']}
            onChange={handleLeverageChange}
            disabled={isMockMode}
          />
          <RangeSlider
            id="slider-rebalance"
            label="Rebalance Threshold"
            value={rebalanceThreshold}
            min={5}
            max={40}
            step={1}
            formatValue={(v) => `${Math.round(v)}%`}
            axisLabels={['5%', '20%', '40%']}
            onChange={handleRebalanceChange}
            disabled={isMockMode}
          />
          <div className="card-helper">How far the position can drift from target before auto-correction triggers.</div>
        </section>

        {/* Signal Thresholds */}
        <section className="config-section reveal-up delay-2" aria-labelledby="cfg-sig-title">
          <h3 className="config-section-title" id="cfg-sig-title">Signal Thresholds</h3>
          <p className="config-section-desc">Limits that prevent the AI from acting in unsafe market conditions.</p>
          <RangeSlider
            id="slider-volatility"
            label="Volatility Limit"
            value={volatilityLimit}
            min={0.1}
            max={1.5}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)}%`}
            axisLabels={['0.10%', '0.75%', '1.50%']}
            onChange={handleVolatilityChange}
            disabled={isMockMode}
          />
          <div className="card-helper">Agent pauses new positions when ETH volatility exceeds this threshold.</div>
          <RangeSlider
            id="slider-hf-min"
            label="Health Factor Minimum"
            value={minHealthFactor}
            min={1.1}
            max={2.5}
            step={0.05}
            formatValue={(v) => v.toFixed(2)}
            axisLabels={['1.10 (risky)', '1.80', '2.50 (safe)']}
            onChange={handleMinHfChange}
            disabled={isMockMode}
          />
          <div className="card-helper">Agent triggers emergency action below this level. Aave liquidates at 1.0.</div>
        </section>

        {/* Automation */}
        <section className="config-section reveal-up delay-3" aria-labelledby="cfg-auto-title">
          <h3 className="config-section-title" id="cfg-auto-title">Automation</h3>
          <p className="config-section-desc">Rules that run independently of the AI engine.</p>
          <ToggleSwitch
            label="Auto-rebalance toggle"
            name="Auto-Rebalance"
            description="Automatically corrects position when health factor drifts outside your threshold — no manual intervention needed."
            checked={autoRebalance}
            onChange={handleAutoRebalanceChange}
            disabled={isMockMode}
          />
          <ToggleSwitch
            label="Emergency exit toggle"
            name="Emergency Exit"
            description="Immediately closes the entire position if health factor drops below your minimum — protects against liquidation."
            checked={emergencyExit}
            onChange={handleEmergencyExitChange}
            disabled={isMockMode}
          />
        </section>

        {/* Quick Presets */}
        <section className="config-section reveal-up delay-4" aria-labelledby="cfg-presets-title">
          <h3 className="config-section-title" id="cfg-presets-title">Quick Presets</h3>
          <p className="config-section-desc">One-click risk profiles. Selecting a preset updates all parameters above.</p>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {Object.entries(PRESETS).map(([name]) => (
              <button
                key={name}
                className={`preset-card${activePreset === name ? ' preset-card--active' : ''}`}
                onClick={() => applyPreset(name)}
                disabled={isMockMode}
              >
                <h4>{name.charAt(0).toUpperCase() + name.slice(1)}</h4>
                <p>
                  {name === 'conservative' && 'Lower leverage, wider safety margins'}
                  {name === 'balanced' && 'Default parameters — moderate risk/reward'}
                  {name === 'aggressive' && 'Higher leverage, tighter margins'}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Action Buttons */}
        <div className="config-btn-row reveal-up delay-5">
          <button
            className="cfg-btn cfg-btn-pause"
            onClick={handlePauseResume}
            aria-label={isPaused ? 'Resume the agent' : 'Pause the agent'}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            className="cfg-btn cfg-btn-stop"
            onClick={handleStop}
            aria-label="Stop the agent"
          >
            Stop
          </button>
          <button
            className="cfg-btn cfg-btn-save"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            aria-label="Save configuration"
          >
            {saveStatus === 'saved' ? '\u2713 Saved' : saveStatus === 'saving' ? 'Saving\u2026' : saveStatus === 'error' ? 'Error — retry' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
