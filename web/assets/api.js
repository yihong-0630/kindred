// ngrok's free tier serves an interstitial to anything with a browser
// User-Agent, which would hand our fetches HTML instead of JSON. The header is
// ignored by every other host, so it costs nothing to always send it.
const BASE_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...BASE_HEADERS,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    location.href = '/?next=' + encodeURIComponent(location.pathname);
    throw new Error('unauthenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data, status: res.status });
  return data;
}

export const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (node) => { while (node.firstChild) node.firstChild.remove(); return node; };

export function when(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 90) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  const d = Math.round(diff / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export const dayName = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });

/** Live feed of what the agent is doing to the room. */
export function subscribe(onEvent) {
  const source = new EventSource('/api/events');
  source.addEventListener('kindred', (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
  });
  return source;
}
