import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { broadcaster } from '../broadcaster.js';

/**
 * DASH-07: Server-Sent Events streaming endpoint.
 * Uses streamSSE from hono/streaming for SSE fan-out.
 * Poller emits to broadcaster; this route subscribes and forwards to clients.
 */
const app = new Hono();

let clientIdCounter = 0;

app.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    const clientId = ++clientIdCounter;
    let msgId = 0;

    // Send initial connected event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ clientId }),
      id: String(msgId++),
    });

    // Handler for broadcaster updates
    const updateHandler = async (event: string, data: unknown): Promise<void> => {
      try {
        await stream.writeSSE({
          event,
          data: JSON.stringify(data),
          id: String(msgId++),
        });
      } catch {
        // Stream may already be closed; ignore write errors
      }
    };

    // Register broadcaster listener
    broadcaster.on('update', updateHandler);

    // Heartbeat every 30 seconds to keep connection alive through proxies
    const heartbeatInterval = setInterval(() => {
      void stream.writeSSE({
        event: 'heartbeat',
        data: '',
      });
    }, 30_000);

    // Cleanup on stream abort (client disconnect)
    stream.onAbort(() => {
      broadcaster.off('update', updateHandler);
      clearInterval(heartbeatInterval);
    });

    // Keep stream open until client disconnects
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  });
});

export default app;
