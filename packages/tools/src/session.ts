import { redis } from './redis.js';

/**
 * DATA-04: Session memory helpers — hot-state ephemeral storage in Redis.
 *
 * All keys are namespaced with "session:" prefix to distinguish session data
 * from other Redis usage (e.g., BullMQ queues use their own prefix).
 *
 * Session data is NOT persisted to Postgres — it exists only in Redis.
 * Default TTL: 3600 seconds (1 hour).
 */

const SESSION_PREFIX = 'session:';
const DEFAULT_TTL_SECONDS = 3600;

function buildKey(key: string): string {
  return `${SESSION_PREFIX}${key}`;
}

/**
 * Store a value in session memory with JSON serialization.
 *
 * @param key - Session key (will be prefixed with "session:")
 * @param value - Any JSON-serializable value
 * @param ttlSeconds - TTL in seconds (default: 3600 / 1 hour)
 */
export async function setSession(
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  await redis.set(buildKey(key), JSON.stringify(value), 'EX', ttlSeconds);
}

/**
 * Retrieve a value from session memory.
 *
 * @param key - Session key (will be prefixed with "session:")
 * @returns The parsed value, or null if the key does not exist or has expired
 */
export async function getSession<T = unknown>(key: string): Promise<T | null> {
  const raw = await redis.get(buildKey(key));
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as T;
}

/**
 * Delete a session key immediately.
 *
 * @param key - Session key (will be prefixed with "session:")
 */
export async function deleteSession(key: string): Promise<void> {
  await redis.del(buildKey(key));
}

/**
 * List all session keys matching an optional glob pattern.
 * Useful for debugging and inspection — do not use in hot paths.
 *
 * @param pattern - Optional glob pattern (default: "*" which matches all session keys)
 * @returns Array of matching Redis keys including the "session:" prefix
 */
export async function listSessionKeys(pattern?: string): Promise<string[]> {
  return redis.keys(`${SESSION_PREFIX}${pattern ?? '*'}`);
}
