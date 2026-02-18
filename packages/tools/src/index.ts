// Redis client and graceful shutdown
export { redis, shutdownRedis } from './redis.js';

// Session memory helpers (DATA-04)
export { setSession, getSession, deleteSession, listSessionKeys } from './session.js';

// Note: Tool registry and implementations will be added in Plan 03.
