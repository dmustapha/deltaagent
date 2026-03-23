// File: src/api-server.ts

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getState, bigintReplacer } from './state-collector.js';
import { updateConfig } from './config.js';
import { pauseAgent, resumeAgent, stopAgent } from './agent-loop.js';
import { getDemoState } from './demo-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_TOKEN = process.env.API_TOKEN || '';
const DEMO_MODE = process.env.DEMO_MODE === 'true' || process.env.USE_MOCK_LLM === 'true';

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!API_TOKEN) { next(); return; }
  const header = req.headers.authorization;
  if (header === `Bearer ${API_TOKEN}`) { next(); return; }
  res.status(401).json({ error: 'Unauthorized: invalid or missing Bearer token' });
}

export function startApiServer(port = 3001): void {
  const app = express();
  app.use(express.json());

  // CORS for Vite dev server
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Bearer token auth on all /api/* routes
  app.use('/api', authMiddleware);

  // State endpoint — returns full DashboardState
  app.get('/api/state', async (_req, res) => {
    try {
      const state = DEMO_MODE ? getDemoState() : await getState();
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(state, bigintReplacer));
    } catch (err) {
      console.error('[API] /api/state error:', err);
      res.status(500).json({ error: 'Failed to collect state' });
    }
  });

  // Config update
  app.post('/api/config', (req, res) => {
    try {
      const result = updateConfig(req.body);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(result, bigintReplacer));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Agent control
  app.post('/api/control', (req, res) => {
    const { action } = req.body;
    if (action === 'pause') pauseAgent();
    else if (action === 'resume') resumeAgent();
    else if (action === 'stop') stopAgent();
    else { res.status(400).json({ error: `Unknown action: ${action}` }); return; }
    res.json({ ok: true, action });
  });

  // Serve built dashboard in production (SPA fallback)
  const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
  app.use(express.static(dashboardDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) { next(); return; }
    res.sendFile(path.join(dashboardDist, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Dashboard not built yet' });
    });
  });

  if (DEMO_MODE) console.log('[API] DEMO_MODE active — serving simulated dashboard data');
  app.listen(port, () => console.log(`[API] Dashboard API on http://localhost:${port}`));
}
