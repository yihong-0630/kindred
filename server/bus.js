import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

/** Server-sent events: the room reacting in real time while the demo runs. */
export function sseHandler(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const send = (payload) => res.write(`event: kindred\ndata: ${JSON.stringify(payload)}\n\n`);
  bus.on('kindred', send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(ping);
    bus.off('kindred', send);
  });
}

export const emit = (type, payload) => bus.emit('kindred', { type, at: new Date().toISOString(), ...payload });
