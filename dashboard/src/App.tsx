import { useState, useEffect, useCallback } from 'react';
import { useAgentState } from './hooks/useAgentState';
import { LandingPage } from './views/LandingPage';
import { Dashboard } from './views/Dashboard';
import { DemoPage } from './views/DemoPage';

type AppView = 'landing' | 'loading' | 'dashboard' | 'demo';

function getInitialView(): AppView {
  if (window.location.pathname === '/demo' || window.location.hash === '#demo') {
    return 'demo';
  }
  return 'landing';
}

function App() {
  const [view, setView] = useState<AppView>(getInitialView);
  const [loadingFading, setLoadingFading] = useState(false);
  const agentState = useAgentState();

  const handleLaunch = useCallback(() => {
    setView('loading');
  }, []);

  const handleBack = useCallback(() => {
    setView('landing');
  }, []);

  useEffect(() => {
    if (view !== 'loading') return;

    const fadeTimer = setTimeout(() => {
      setLoadingFading(true);
    }, 1500);

    const transitionTimer = setTimeout(() => {
      setLoadingFading(false);
      setView('dashboard');
    }, 1900);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(transitionTimer);
    };
  }, [view]);

  return (
    <>
      <div className="deco-hatch" aria-hidden="true" />

      {view === 'landing' && <LandingPage onLaunch={handleLaunch} />}

      {view === 'loading' && (
        <div
          className="loading-screen"
          role="status"
          aria-label="Loading DeltaAgent dashboard"
          style={{
            opacity: loadingFading ? 0 : 1,
            transition: 'opacity 0.4s ease',
          }}
        >
          <div className="deco-hatch" aria-hidden="true" />
          <div className="loading-brand" aria-hidden="true">
            DeltaAgent
          </div>
          <div className="loading-bar-wrap">
            <div className="loading-bar-fill" />
          </div>
          <div className="loading-text">Initializing agent...</div>
        </div>
      )}

      {view === 'dashboard' && (
        <Dashboard
          state={agentState.state}
          error={agentState.error}
          connected={agentState.connected}
          updateConfig={agentState.updateConfig}
          controlAgent={agentState.controlAgent}
          onBack={handleBack}
        />
      )}

      {view === 'demo' && <DemoPage />}
    </>
  );
}

export default App;
