import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { config } from './config.js';
import { COOKIE, checkCredentials, createSession, readSession, cookieOptions, requireAuth } from './auth.js';
import { modules, findModule, moduleStatus, publicModule } from './modules.js';
import { migrate } from './db.js';
import { router as workspace } from './workspace.js';
import { router as records } from './records.js';
import { router as planner } from './planner.js';
import { router as attachments } from './attachments.js';
import { router as cp } from './cp.js';

const app = express();
app.set('trust proxy', 1); // DigitalOcean App Platform load balancer
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
      // Served over plain http (e.g. a bare IP), browsers must not be told to switch to https.
      'upgrade-insecure-requests': config.cookieSecure ? [] : null,
    },
  },
  strictTransportSecurity: config.cookieSecure,
}));
app.use(compression());
app.use(cookieParser());

// The web app build this server ships (its hashed entry script). API replies carry it, so a page left open
// across an update can tell it is out of date and offer a reload.
const dist = new URL('../dist', import.meta.url).pathname;
const clientBuild = (() => {
  try { return /\/assets\/(index-[\w-]+\.js)/.exec(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'))?.[1] || ''; } catch { return ''; }
})();
if (clientBuild) app.use('/api', (req, res, next) => { res.set('X-Wolf-Client', clientBuild); next(); });

app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ---------- Auth ---------- */

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' } });

app.post('/api/auth/login', loginLimiter, express.json({ limit: '10kb' }), (req, res) => {
  const { username, password } = req.body || {};
  if (!checkCredentials(username, password)) return res.status(401).json({ error: 'Username or password is incorrect' });
  res.cookie(COOKIE, createSession(config.username), cookieOptions());
  res.json({ username: config.username });
});

app.get('/api/auth/me', (req, res) => {
  const session = readSession(req.cookies?.[COOKIE]);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  res.json(session);
});

app.post('/api/auth/logout', (req, res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
  res.status(204).end();
});

/* ---------- Workspace (projects, research, academics) ---------- */

// Businesses keep working if Wolf's own database is down; the workspace retries until it can migrate.
let workspaceReady = false;
async function prepareWorkspace() {
  try {
    await migrate();
    workspaceReady = true;
    console.log('[wolf] workspace database ready');
  } catch (err) {
    console.error(`[wolf] workspace database unavailable (${err.message}); retrying in 30s`);
    setTimeout(prepareWorkspace, 30_000).unref();
  }
}
prepareWorkspace();

app.use('/api/w', requireAuth, (req, res, next) => {
  if (!workspaceReady) return res.status(503).json({ error: 'The workspace database is not reachable right now' });
  next();
}, workspace, records, planner, attachments, cp);

/* ---------- Business modules ---------- */

app.get('/api/modules', requireAuth, async (req, res) => {
  const list = await Promise.all(modules.map(async (m) => publicModule(m, await moduleStatus(m))));
  res.json(list);
});

// Each business gets an authenticated passthrough to its own admin API.
for (const m of modules) {
  const proxy = createProxyMiddleware({
    target: m.apiUrl,
    changeOrigin: true,
    proxyTimeout: 60_000,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-admin-key', m.adminKey);
        proxyReq.removeHeader('cookie');
        fixRequestBody(proxyReq, req);
      },
      error: (err, req, res) => {
        if (!res.headersSent && typeof res.status === 'function') {
          res.status(503).json({ error: `${m.name} is inactive right now` });
        } else res.end?.();
      },
    },
  });

  app.use(`/api/m/${m.id}`, requireAuth, (req, res, next) => {
    const p = req.path;
    if (!m.allowedPaths.some((re) => re.test(p)) || p.includes('..')) return res.status(404).json({ error: 'Not found' });
    next();
  }, (req, res, next) => {
    // Record who changed an order or sent an invoice. Only these JSON bodies are parsed; uploads stream through untouched.
    const recordsActor = req.method === 'PATCH' || (req.method === 'PUT' && /\/orders\/\d+\/quote$/.test(req.path));
    if (recordsActor && req.is('application/json')) {
      return express.json({ limit: '1mb' })(req, res, () => {
        if (req.body && typeof req.body === 'object') req.body.actor = req.user.username;
        next();
      });
    }
    next();
  }, proxy);
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- Web app ---------- */

if (fs.existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  // Always check for a newer build, so a reload picks up an update straight away.
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
});

app.listen(config.port, () => console.log(`[wolf] listening on :${config.port}`));
