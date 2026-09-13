import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './routes.js';
import { sseHandler } from './bus.js';
import { currentUser } from './auth.js';
import { seed } from './seed.js';
import { lanAddresses, primaryAddress, publicOrigin } from './net.js';
import { svg as qrSvg } from './qr.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'web');
const PORT = Number(process.env.PORT) || 4000;

// Load .env if present — no dependency, just the five keys we care about.
try {
  const env = await readFile(join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env, fine */ }

const seeded = seed();
console.log(seeded.seeded ? '· seeded demo org' : '· using existing ledger');
if (seeded.practices) console.log(`· added ${seeded.practices} curated evidence-backed practices`);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

// Pages behind the login. Everything else under /web is public static.
const PAGES = {
  '/': 'index.html',
  '/login': 'index.html',
  '/app': 'app.html',
  '/dashboard': 'dashboard.html'
};
const PROTECTED = new Set(['/app', '/dashboard']);

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1e6) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function serveFile(res, filePath, code = 200) {
  try {
    const data = await readFile(filePath);
    res.writeHead(code, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const key = `${req.method} ${path}`;

  // CORS for native and Expo-web clients. Deliberately no
  // Access-Control-Allow-Credentials: that is what keeps `*` safe here, because
  // browsers will not attach the session cookie cross-origin. Native clients
  // authenticate with `Authorization: Bearer <token>`, which is only ever sent
  // on purpose, so cross-origin requests cannot ride on an existing session.
  if (path.startsWith('/api/') || path === '/qr.svg') {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization, ngrok-skip-browser-warning');
    res.setHeader('access-control-max-age', '600');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
  }

  try {
    if (path === '/api/events') return sseHandler(req, res);

    if (path === '/qr.svg') {
      const target = url.searchParams.get('url') || `${publicOrigin(req, PORT)}/app`;
      try {
        const body = qrSvg(target, { scale: Number(url.searchParams.get('scale')) || 8 });
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
        return res.end(body);
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end(String(err.message || err));
      }
    }

    const handler = routes[key];
    if (handler) {
      const body = await readBody(req);
      return await handler(req, res, { body, url });
    }
    if (path.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not_found', path }));
    }

    if (PAGES[path]) {
      if (PROTECTED.has(path) && !currentUser(req)) {
        res.writeHead(302, { location: `/?next=${encodeURIComponent(path)}` });
        return res.end();
      }
      if (await serveFile(res, join(webDir, PAGES[path]))) return;
    }

    const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
    if (await serveFile(res, join(webDir, safe))) return;

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error('!', key, err);
    res.writeHead(err.message === 'payload_too_large' ? 413 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'server_error', message: String(err.message || err) }));
  }
});

// 0.0.0.0 so a phone on the same network can reach the laptop running this.
server.listen(PORT, '0.0.0.0', () => {
  const engine = process.env.OPENAI_API_KEY ? 'openai' : 'local reframe engine';
  const research = process.env.EXA_API_KEY ? 'exa search connected' : 'curated set only (no EXA_API_KEY)';
  const lan = lanAddresses();
  const host = primaryAddress();

  const onThisMachine = [
    `  entry point   http://localhost:${PORT}/`,
    `  phone app     http://localhost:${PORT}/app`,
    `  dashboard     http://localhost:${PORT}/dashboard`
  ].join('\n');

  const onOtherDevices = lan.length
    ? [
        '',
        '',
        '  ── on another device, same wifi ──────────────',
        ...lan.map((a) => `  ${a.name.padEnd(12)}http://${a.address}:${PORT}`),
        `  phone app     http://${host}:${PORT}/app`,
        `  scan instead  the login page shows a QR for that URL`
      ].join('\n')
    : '\n  (no network interface found — this machine is localhost only)';

  console.log(`
  Kindred — the happiness ledger
  ──────────────────────────────────────────────
${onThisMachine}${onOtherDevices}

  demo login    aina@kindred.app / kindred
  judge access  passcode "${process.env.JUDGE_PASSCODE || 'kindred'}"
  agent brain   ${engine}
  team layer    ${process.env.SLACK_WEBHOOK_URL ? 'slack webhook connected' : 'in-app #kindred channel'}
  evidence      ${research}
`);
});
