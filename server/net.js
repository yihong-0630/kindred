import { networkInterfaces } from 'node:os';

/** Every address a phone on the same network could reach this server on. */
export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // Physical interfaces first; virtual ones (docker, vpn, bridges) last.
      const physical = /^(en|eth|wlan|wl)\d/.test(name);
      out.push({ name, address: addr.address, physical });
    }
  }
  return out.sort((a, b) => Number(b.physical) - Number(a.physical));
}

export const primaryAddress = () => lanAddresses()[0]?.address || 'localhost';

export const baseUrl = (port) => `http://${primaryAddress()}:${port}`;

/**
 * The address a client should use to reach this server, as seen from that
 * client. Behind a tunnel (ngrok, cloudflared) the forwarded headers carry the
 * public name, so the pairing QR and mobile config hand out the public URL
 * rather than a LAN address the phone may not be able to route to.
 *
 * PUBLIC_URL wins over everything when set, for a fixed deployment.
 */
export function publicOrigin(req, port) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');

  const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (fwdHost) return `${fwdProto || 'https'}://${fwdHost}`;

  const host = String(req.headers.host || '').split(',')[0].trim();
  // A request that arrived on localhost tells us nothing about what a phone
  // should dial, so fall back to the LAN address in that case.
  if (host && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return `http://${host}`;
  return `http://${primaryAddress()}:${port}`;
}

/** True when the request came through a tunnel rather than straight off the LAN. */
export const isTunnelled = (req) =>
  Boolean(process.env.PUBLIC_URL || req.headers['x-forwarded-host']);
