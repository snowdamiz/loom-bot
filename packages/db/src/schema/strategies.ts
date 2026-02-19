/**
 * Strategies schema has been co-located with goals.ts to avoid cross-file imports
 * that break drizzle-kit's CJS bundler (.js extension cannot resolve back to .ts).
 * This file re-exports from goals.ts for backward compatibility.
 */
export { strategies, type Strategy, type NewStrategy } from './goals.js';
