import { EventEmitter } from 'node:events';

/**
 * DASH-07: SSE broadcaster singleton.
 * Central fan-out mechanism: poller emits to broadcaster, SSE route subscribes.
 * Multiple browser tabs may connect, so maxListeners is set generously.
 */
export const broadcaster = new EventEmitter();
broadcaster.setMaxListeners(100);
