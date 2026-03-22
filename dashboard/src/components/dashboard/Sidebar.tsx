import { useCallback, useRef } from 'react';
import type React from 'react';

type TabId = 'position' | 'signals' | 'activity' | 'config';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}

interface NavItemConfig {
  id: TabId;
  label: string;
  icon: React.ReactElement;
  badge?: number;
}

const LIVE_ITEMS: NavItemConfig[] = [
  {
    id: 'position',
    label: 'Position',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'signals',
    label: 'Signals',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

const CONTROLS_ITEMS: NavItemConfig[] = [
  {
    id: 'activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: 'config',
    label: 'Config',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const ALL_TAB_IDS: TabId[] = ['position', 'signals', 'activity', 'config'];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = ALL_TAB_IDS.indexOf(activeTab);
      let nextIndex = currentIndex;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % ALL_TAB_IDS.length;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + ALL_TAB_IDS.length) % ALL_TAB_IDS.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = ALL_TAB_IDS.length - 1;
      } else {
        return;
      }

      onTabChange(ALL_TAB_IDS[nextIndex]);
      const button = navRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab="${ALL_TAB_IDS[nextIndex]}"]`,
      );
      button?.focus();
    },
    [activeTab, onTabChange],
  );

  return (
    <nav
      ref={navRef}
      className="sidebar"
      aria-label="Dashboard navigation"
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      <div className="sidebar-section-label">Live</div>
      <NavGroup items={LIVE_ITEMS} activeTab={activeTab} onTabChange={onTabChange} />

      <div className="sidebar-deco-div" aria-hidden="true" />

      <div className="sidebar-section-label">Controls</div>
      <NavGroup items={CONTROLS_ITEMS} activeTab={activeTab} onTabChange={onTabChange} />

      <div className="sidebar-footer">
        <div className="sidebar-version">v1.0.0 &middot; Arbitrum</div>
      </div>
    </nav>
  );
}

function NavGroup({
  items,
  activeTab,
  onTabChange,
}: {
  items: NavItemConfig[];
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}) {
  return (
    <div className="sidebar-nav">
      {items.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            data-tab={item.id}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(item.id)}
          >
            {item.icon}
            {item.label}
            {item.badge != null && (
              <span className="nav-badge" aria-label={`${item.badge} active signals`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
