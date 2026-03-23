import { useEffect, useState } from 'react';

const YOUTUBE_EMBED_ID = ''; // Replace with real YouTube video ID after upload

export function DemoPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="demo-page"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      <div className="deco-hatch" aria-hidden="true" />

      <header className="demo-header">
        <a href="/" className="demo-back-link">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to app
        </a>
        <h1 className="demo-brand">
          <img src="/logo.png" alt="" className="demo-brand-logo" />
          DeltaAgent
        </h1>
      </header>

      <main className="demo-main">
        {YOUTUBE_EMBED_ID ? (
          <div className="demo-video-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_EMBED_ID}?rel=0&modestbranding=1`}
              title="DeltaAgent Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="demo-video-iframe"
            />
          </div>
        ) : (
          <div className="demo-placeholder">
            <div className="demo-placeholder-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <polygon points="26,20 26,44 46,32" fill="currentColor" opacity="0.6"/>
              </svg>
            </div>
            <h2 className="demo-placeholder-title">Demo Video</h2>
            <p className="demo-placeholder-sub">Full walkthrough coming shortly.</p>
          </div>
        )}

        <section className="demo-info">
          <h2 className="demo-info-title">What is DeltaAgent?</h2>
          <p className="demo-info-text">
            An autonomous AI agent that manages leveraged ETH long positions on Aave V3 (Arbitrum).
            Every 30 seconds, it aggregates six market signals, feeds them to an LLM, and executes
            the recommended trading action on-chain.
          </p>

          <div className="demo-features-grid">
            <div className="demo-feature-card">
              <div className="demo-feature-label">AI Brain</div>
              <div className="demo-feature-desc">Llama 3.3 70B via Groq analyzes price, sentiment, volatility, health factor, TVL, and rates each cycle</div>
            </div>
            <div className="demo-feature-card">
              <div className="demo-feature-label">On-Chain Execution</div>
              <div className="demo-feature-desc">Supply WETH, borrow USDT0, swap via Velora/Uniswap. All through Tether's WDK on Arbitrum</div>
            </div>
            <div className="demo-feature-card">
              <div className="demo-feature-label">Safety-First</div>
              <div className="demo-feature-desc">Hard leverage cap (3.0x), minimum health factor (1.3), circuit breaker after 3 failures, emergency exit</div>
            </div>
            <div className="demo-feature-card">
              <div className="demo-feature-label">Live Dashboard</div>
              <div className="demo-feature-desc">Real-time position tracking, signal visualization, decision feed, transaction history, runtime config</div>
            </div>
          </div>

          <div className="demo-links">
            <a href="https://github.com/dmustapha/deltaagent" target="_blank" rel="noopener noreferrer" className="demo-link-btn">
              View Source
            </a>
            <a href="/" className="demo-link-btn demo-link-btn--secondary">
              Live Dashboard
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
