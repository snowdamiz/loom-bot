import { customType, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * IDENT-03, IDENT-06: Identity management tables.
 *
 * identities — Core table storing fake persona data for browser-based automation.
 * identity_accounts — Maps identities to service accounts (Twitter, GitHub, etc.)
 * credentials — Encrypted credential vault (bytea via pgcrypto)
 * credential_access_audit — Access audit trail for credentials
 *
 * All four tables are co-located here to avoid cross-file FK issues with
 * drizzle-kit's CJS bundler (esbuild-register cannot resolve `.js` imports
 * back to `.ts` files at bundle time). Same pattern as goals.ts + sub_goals.
 */

// ---------------------------------------------------------------------------
// bytea custom type for pgcrypto-encrypted values
// pgcrypto pgp_sym_encrypt() returns raw binary — must use bytea, not text
// ---------------------------------------------------------------------------
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    if (Buffer.isBuffer(value)) return value;
    return Buffer.from(value as Uint8Array);
  },
});

// ---------------------------------------------------------------------------
// identities
// ---------------------------------------------------------------------------

/**
 * Core identity table. Each row is a fully constructed fake persona used to
 * isolate browser contexts and service accounts.
 */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Faker-generated full name */
  name: text('name').notNull(),
  /** Temp email used during account creation */
  email: text('email').notNull(),
  /**
   * Full persona backstory as JSONB: phone, address, DOB, bio, jobTitle,
   * username, and anything else faker generates.
   */
  persona: jsonb('persona').notNull(),
  /** URL to AI-generated face or randomuser.me — nullable until assigned */
  profilePictureUrl: text('profile_picture_url'),
  /**
   * Identity lifecycle per locked design decision:
   * active | suspended | retired | archived
   */
  status: text('status').notNull().default('active'),
  /** Risk score 0–100; elevated on suspicious activity */
  riskScore: integer('risk_score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  notes: text('notes'),
});

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;

// ---------------------------------------------------------------------------
// identity_accounts
// ---------------------------------------------------------------------------

/**
 * IDENT-06: Per-identity service account tracking.
 * Co-located with identities to avoid drizzle-kit CJS bundler FK resolution issue.
 */
export const identityAccounts = pgTable('identity_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => identities.id),
  /** Service name e.g. 'twitter', 'github', 'stripe', 'reddit' */
  service: text('service').notNull(),
  username: text('username'),
  /** active | suspended | banned | deleted */
  status: text('status').notNull().default('active'),
  /**
   * Why this account was created — required for IDENT-06 accountability.
   * e.g. "Twitter account for social media automation strategy"
   */
  purpose: text('purpose').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IdentityAccount = typeof identityAccounts.$inferSelect;
export type NewIdentityAccount = typeof identityAccounts.$inferInsert;

// ---------------------------------------------------------------------------
// credentials
// ---------------------------------------------------------------------------

/**
 * BROWSER-05: Encrypted credential vault.
 *
 * encryptedValue uses a bytea column. Encryption: pgp_sym_encrypt(value, key, 'cipher-algo=aes256').
 * Decryption: pgp_sym_decrypt(encrypted_value, key).
 *
 * identityId is nullable: NULL = operator-provided credential (API keys etc.);
 * non-null = identity-specific credential (persona's Twitter password etc.).
 */
export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id').references(() => identities.id),
  service: text('service').notNull(),
  /** Credential type: 'password', 'api_key', 'oauth_token', 'refresh_token' */
  key: text('key').notNull(),
  /** AES-256 encrypted value via pgcrypto — MUST be bytea, not text */
  encryptedValue: bytea('encrypted_value').notNull(),
  /** active | rotated | expired */
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

// ---------------------------------------------------------------------------
// credential_access_audit
// ---------------------------------------------------------------------------

/**
 * BROWSER-05: Audit trail for every credential read operation.
 *
 * identityId is denormalized from credentials.identityId for fast per-identity
 * queries without joining through credentials.
 */
export const credentialAccessAudit = pgTable('credential_access_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id')
    .notNull()
    .references(() => credentials.id),
  /** Tool name or 'agent-loop' — identifies the consumer */
  accessedBy: text('accessed_by').notNull(),
  /** Agent-provided reason for accessing this credential */
  purpose: text('purpose').notNull(),
  /** Denormalized from credentials.identityId for fast per-identity audit queries */
  identityId: uuid('identity_id').references(() => identities.id),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CredentialAccessAudit = typeof credentialAccessAudit.$inferSelect;
export type NewCredentialAccessAudit = typeof credentialAccessAudit.$inferInsert;
