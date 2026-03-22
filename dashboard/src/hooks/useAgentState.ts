import { useState, useEffect, useRef, useCallback } from 'react';
import type { DashboardState } from '../types';

const POLL_INTERVAL = 2500;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  return headers;
}

export function useAgentState() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchState = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/api/state`, { signal: abortRef.current.signal, headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState(data);
      setError(null);
      setConnected(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchState]);

  const updateConfig = useCallback(async (config: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(config),
    });
    return res.json();
  }, []);

  const controlAgent = useCallback(async (action: 'pause' | 'resume' | 'stop') => {
    const res = await fetch(`${API_BASE}/api/control`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action }),
    });
    return res.json();
  }, []);

  return { state, error, connected, updateConfig, controlAgent, refetch: fetchState };
}
