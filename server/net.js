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
