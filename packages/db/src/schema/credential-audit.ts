/**
 * Re-export shim for backward compatibility.
 * credentialAccessAudit table is defined in identities.ts (co-located to avoid
 * drizzle-kit CJS bundler cross-file FK resolution failures).
 */
export {
  credentialAccessAudit,
  type CredentialAccessAudit,
  type NewCredentialAccessAudit,
} from './identities.js';
