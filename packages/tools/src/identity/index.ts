import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';
import { createCredentialStoreTool, createCredentialRetrieveTool } from './credential-vault.js';
import { createIdentityTool } from './create-identity.js';
import { createTempEmailTool, createCheckTempEmailTool } from './temp-email.js';
import { createRetireIdentityTool } from './retire-identity.js';
import { createRequestOperatorCredentialsTool } from './operator-escalation.js';

// Re-export individual factories for granular use
export {
  createCredentialStoreTool,
  createCredentialRetrieveTool,
  storeCredential,
  retrieveCredential,
  listCredentials,
  rotateCredential,
} from './credential-vault.js';

export { createIdentityTool } from './create-identity.js';
export { createTempEmailTool, createCheckTempEmailTool } from './temp-email.js';
export { createRetireIdentityTool } from './retire-identity.js';
export { createRequestOperatorCredentialsTool } from './operator-escalation.js';

/**
 * createIdentityTools(db) — convenience factory returning all identity ToolDefinitions.
 *
 * Returns 7 tools:
 * 1. identity_create         — generate faker persona, insert to DB, store password in vault
 * 2. credential_store        — encrypt+store a credential with pgcrypto AES-256
 * 3. credential_retrieve     — decrypt+return a credential (every access audited)
 * 4. temp_email_create       — get a Guerrilla Mail throwaway address + session token
 * 5. temp_email_check        — poll Guerrilla Mail inbox for new messages
 * 6. identity_retire         — retire identity + archive all its credentials
 * 7. request_operator_credentials — send Discord DM requesting operator credentials
 *
 * Same pattern as createWalletTools(db, signerClient).
 */
export function createIdentityTools(db: DbClient): ToolDefinition[] {
  return [
    createIdentityTool(db),
    createCredentialStoreTool(db),
    createCredentialRetrieveTool(db),
    createTempEmailTool(),
    createCheckTempEmailTool(),
    createRetireIdentityTool(db),
    createRequestOperatorCredentialsTool(),
  ];
}
