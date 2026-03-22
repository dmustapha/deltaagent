import { useEffect, useRef } from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface LandingPageProps {
  onLaunch: () => void;
}

export function LandingPage({ onLaunch }: LandingPageProps) {
  const landingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = landingRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                entry.target.classList.add('revealed');
              });
            });
          }
        });
      },
      { threshold: 0.15 },
    );

    const revealElements = container.querySelectorAll(
      '.reveal-right, .reveal-left, .reveal-up',
    );
    revealElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={landingRef} style={{ position: 'relative', zIndex: 2 }}>
      <LandingNav onLaunch={onLaunch} />
      <HeroSection onLaunch={onLaunch} />
      <div className="deco-section-divider" aria-hidden="true" />
      <FeaturesSection />
      <StatsSection />
      <CtaSection onLaunch={onLaunch} />
      <LandingFooter />
    </div>
  );
}

function LandingNav({ onLaunch }: { onLaunch: () => void }) {
  return (
    <nav className="landing-nav" aria-label="Main navigation">
      <span className="brand" aria-label="DeltaAgent">
        DeltaAgent
      </span>
      <button
        className="nav-cta"
        onClick={onLaunch}
        aria-label="Launch the DeltaAgent dashboard"
      >
        Launch App
      </button>
    </nav>
  );
}

function HeroSection({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="landing-hero" aria-labelledby="hero-brand">
      <div className="landing-glow-top" aria-hidden="true" />
      <div className="sunburst-wrap" aria-hidden="true">
        <div className="sunburst-outer" />
        <div className="sunburst-inner" />
        <div className="sunburst-glow" />
      </div>
      <div className="hero-content">
        <p className="hero-eyebrow">AI-Powered DeFi on Aave V3</p>
        <h1 id="hero-brand" className="hero-brand">
          DeltaAgent
        </h1>
        <div className="hero-deco-lines" aria-hidden="true">
          <div className="deco-line" />
          <div className="deco-diamond" />
          <div className="deco-line" />
        </div>
        <p className="hero-tagline">Your Autonomous Leverage Engine</p>
        <p className="hero-subtitle">
          DeltaAgent watches ETH markets around the clock — analyzing price,
          volatility, and on-chain signals — then manages your leveraged Aave
          position so you don&apos;t have to.
        </p>
        <div className="hero-cta-wrap">
          <div className="hero-cta-ring" aria-hidden="true" />
          <button
            className="hero-cta"
            onClick={onLaunch}
            aria-label="Launch the DeltaAgent dashboard"
          >
            Launch Dashboard
          </button>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      label: 'Signal Layer',
      title: 'Real-Time Signal Feed',
      desc: 'Pulls live ETH price, RSI, volatility, Fear & Greed index, and Aave rates. Every metric the agent uses to decide — visible to you.',
      reveal: 'reveal-left',
      delay: 'delay-1',
    },
    {
      label: 'Cognition Layer',
      title: 'AI Reasoning Engine',
      desc: 'Each cycle, the LLM evaluates all signals against your risk parameters and decides: hold, increase, decrease, open, or close. Full reasoning logged.',
      reveal: 'reveal-right',
      delay: 'delay-2',
    },
    {
      label: 'Execution Layer',
      title: 'On-Chain Execution',
      desc: 'When the AI decides to act, it executes directly on Aave V3 — supplying WETH, borrowing USDT, rebalancing collateral. No manual steps.',
      reveal: 'reveal-left',
      delay: 'delay-3',
    },
    {
      label: 'Audit Layer',
      title: 'Complete Audit Trail',
      desc: 'Every decision, every transaction, every signal — logged and visible in the dashboard. You always know what the agent did and why.',
      reveal: 'reveal-right',
      delay: 'delay-4',
    },
  ];

  return (
    <section className="landing-section" aria-labelledby="features-title">
      <div className="section-header reveal-up">
        <p className="section-eyebrow">Core Capabilities</p>
        <h2 className="section-title" id="features-title">
          Built for precision at every cycle
        </h2>
        <div className="gold-divider" aria-hidden="true" />
      </div>
      <div className="features-grid">
        {features.map((f) => (
          <article
            key={f.title}
            className={`feature-card ${f.reveal} ${f.delay}`}
            aria-label={f.title}
          >
            <p className="feature-label">{f.label}</p>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatsSection() {
  const statsRef = useRef<HTMLElement>(null);
  const isVisible = useIntersectionObserver(statsRef, {
    threshold: 0.5,
    triggerOnce: true,
  });

  const cycles = useCountUp({ target: 247, duration: 1400, trigger: isVisible });
  const uptime = useCountUp({
    target: 99.2,
    duration: 1600,
    suffix: '%',
    decimals: 1,
    trigger: isVisible,
  });
  const netValue = useCountUp({
    target: 2400,
    duration: 1800,
    prefix: '$',
    trigger: isVisible,
  });
  const confidence = useCountUp({
    target: 82,
    duration: 1400,
    suffix: '%',
    trigger: isVisible,
  });

  return (
    <section
      ref={statsRef}
      className="stats-section"
      aria-labelledby="stats-title"
    >
      <div className="stats-grid">
        <div className="stat-item reveal-up delay-1">
          <div className="stat-value" aria-label="247 decision cycles">
            {cycles}
          </div>
          <div className="stat-label">Cycles Run</div>
        </div>
        <div className="stat-item reveal-up delay-2">
          <div
            className="stat-value teal"
            aria-label="99.2% uptime"
          >
            {uptime}
          </div>
          <div className="stat-label">Uptime</div>
        </div>
        <div className="stat-item reveal-up delay-3">
          <div className="stat-value" aria-label="$2,400 net value">
            {netValue}
          </div>
          <div className="stat-label">Net Portfolio Value</div>
        </div>
        <div className="stat-item reveal-up delay-4">
          <div
            className="stat-value teal"
            aria-label="82% avg confidence"
          >
            {confidence}
          </div>
          <div className="stat-label">Avg Confidence</div>
        </div>
      </div>
    </section>
  );
}

function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="landing-cta-section" aria-labelledby="cta-title">
      <div className="cta-aurora-orb" aria-hidden="true" />
      <h2 className="cta-title reveal-up" id="cta-title">
        Your leverage, on autopilot.
      </h2>
      <p className="cta-subtitle reveal-up delay-1">
        Set your risk parameters. The agent handles the rest — monitoring
        signals, making decisions, and executing on-chain. You just watch.
      </p>
      <div className="hero-cta-wrap reveal-up delay-2">
        <div className="hero-cta-ring" aria-hidden="true" />
        <button
          className="hero-cta"
          onClick={onLaunch}
          aria-label="Launch the DeltaAgent dashboard"
        >
          Launch Dashboard
        </button>
      </div>
      <div
        className="deco-chevron-row reveal-up delay-3"
        aria-hidden="true"
      >
        <div className="deco-chevron" />
        <div className="deco-chevron" />
        <div className="deco-chevron" />
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span className="footer-brand">DeltaAgent</span>
      <span className="footer-inspiration">
        Bloomberg (data density) + Afrofuturism (gold warmth)
      </span>
      <span>v1.0.0 &middot; Arbitrum One</span>
    </footer>
  );
}
