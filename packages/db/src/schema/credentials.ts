/**
 * Re-export shim for backward compatibility.
 * credentials table is defined in identities.ts (co-located to avoid
 * drizzle-kit CJS bundler cross-file FK resolution failures).
 */
export { credentials, type Credential, type NewCredential } from './identities.js';
