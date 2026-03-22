import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { DashboardState } from '../types';
import { DashHeader } from '../components/dashboard/DashHeader';
import { Sidebar } from '../components/dashboard/Sidebar';
import { MOCK_STATE } from '../utils/mockState';
import {
  PositionTab,
  SignalsTab,
  ActivityTab,
  ConfigTab,
} from '../components/tabs';

type TabId = 'position' | 'signals' | 'activity' | 'config';

const GLOW_COLORS: Record<TabId, string> = {
  position:
    'radial-gradient(ellipse 60% 60% at 40% 0%, oklch(0.70 0.18 145 / 0.08), transparent)',
  signals:
    'radial-gradient(ellipse 60% 60% at 60% 0%, oklch(0.72 0.18 80 / 0.09), transparent)',
  activity:
    'radial-gradient(ellipse 60% 60% at 40% 0%, oklch(0.72 0.14 175 / 0.08), transparent)',
  config:
    'radial-gradient(ellipse 60% 60% at 70% 0%, oklch(0.72 0.18 80 / 0.07), transparent)',
};

interface DashboardProps {
  state: DashboardState | null;
  error: string | null;
  connected: boolean;
  updateConfig: (config: Record<string, unknown>) => Promise<unknown>;
  controlAgent: (action: 'pause' | 'resume' | 'stop') => Promise<unknown>;
  onBack: () => void;
}

export function Dashboard({
  state,
  updateConfig,
  controlAgent,
  onBack,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('position');
  const mainRef = useRef<HTMLElement>(null);

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const revealElements = main.querySelectorAll(
      '.reveal-right, .reveal-left, .reveal-up',
    );

    revealElements.forEach((el, i) => {
      el.classList.remove('revealed');
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.classList.add('revealed');
          });
        });
      }, i * 60);
    });
  }, [activeTab]);

  const effectiveState = useMemo(() => state ?? MOCK_STATE, [state]);

  return (
    <div
      className="dashboard-root"
      role="application"
      aria-label="DeltaAgent Dashboard"
    >
      <DashHeader state={effectiveState} onBack={onBack} />
      <div className="dash-body">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <main className="dash-main" id="main-content" ref={mainRef}>
          <div
            className="tab-glow-pool"
            aria-hidden="true"
            style={{ background: GLOW_COLORS[activeTab] }}
          />
          <div className="tab-panel">
            <TabContent
              activeTab={activeTab}
              state={effectiveState}
              updateConfig={updateConfig}
              controlAgent={controlAgent}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

interface TabContentProps {
  activeTab: TabId;
  state: DashboardState;
  updateConfig: (config: Record<string, unknown>) => Promise<unknown>;
  controlAgent: (action: 'pause' | 'resume' | 'stop') => Promise<unknown>;
}

function TabContent({
  activeTab,
  state,
  updateConfig,
  controlAgent,
}: TabContentProps) {
  switch (activeTab) {
    case 'position':
      return <PositionTab position={state.position} />;
    case 'signals':
      return (
        <SignalsTab
          signals={state.signals}
        />
      );
    case 'activity':
      return (
        <ActivityTab
          currentDecision={state.currentDecision}
          decisionHistory={state.decisionHistory}
          cycleNumber={state.agent.cycleNumber}
          transactions={state.transactions}
        />
      );
    case 'config':
      return (
        <ConfigTab
          config={state.config}
          agentStatus={state.agent.status}
          isMockMode={state.config.useMockLlm === true}
          updateConfig={updateConfig}
          controlAgent={controlAgent}
        />
      );
  }
}
