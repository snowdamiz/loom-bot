import { Redis } from 'ioredis';

/**
 * DATA-04: Redis client for hot-state session memory.
 *
 * Redis holds only ephemeral session data — all persistent data lives in Postgres.
 * Losing Redis means losing only session cache, not any permanent storage.
 *
 * Configured per research pitfall #5:
 * - commandTimeout: 5000ms to prevent hanging commands
 * - retryStrategy: exponential backoff up to 3000ms between retries
 * - error handler: logs to stderr (NOT Postgres — Redis errors may occur when DB is also down)
 */
export const redis = new Redis(process.env.REDIS_URL!, {
  // Timeout individual commands after 5 seconds to prevent hangs
  commandTimeout: 5000,

  // Reconnect with exponential backoff, capped at 3s between attempts
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },

  // Don't throw on initial connection failure — let retryStrategy handle it
  lazyConnect: false,
});

// Log Redis errors to stderr only — not Postgres (DB may also be down during Redis failures)
redis.on('error', (err: Error) => {
  process.stderr.write(`[redis] error: ${err.message}\n`);
});

redis.on('connect', () => {
  process.stderr.write('[redis] connected\n');
});

redis.on('reconnecting', () => {
  process.stderr.write('[redis] reconnecting...\n');
});

/**
 * Gracefully disconnect from Redis.
 * Sends QUIT command and waits for acknowledgment before closing the socket.
 * Call this before process exit to avoid abrupt disconnection.
 */
export async function shutdownRedis(): Promise<void> {
  await redis.quit();
}
