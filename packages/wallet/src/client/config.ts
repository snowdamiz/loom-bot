import { DbClient, walletConfig, eq } from '@jarvis/db';

/**
 * Canonical wallet configuration keys stored in the wallet_config table.
 * Using constants prevents typos and provides discoverability.
 */
export const WalletConfigKeys = {
  /** Solana RPC HTTP endpoint — e.g. https://api.mainnet-beta.solana.com */
  RPC_URL: 'rpc_url',
  /** Solana RPC WebSocket endpoint for subscriptions */
  WSS_URL: 'wss_url',
  /** The agent's wallet public key in base58 encoding */
  WALLET_PUBLIC_KEY: 'wallet_public_key',
  /** Balance poll interval in milliseconds (default: 60000) */
  BALANCE_POLL_INTERVAL_MS: 'balance_poll_interval_ms',
  /** Optional Jupiter aggregator API key */
  JUPITER_API_KEY: 'jupiter_api_key',
} as const;

/**
 * Read a single wallet config value from the wallet_config table.
 * Returns null if the key is not found or not active.
 */
export async function getWalletConfig(
  db: DbClient,
  key: string,
): Promise<string | null> {
  const rows = await db
    .select({ value: walletConfig.value })
    .from(walletConfig)
    .where(eq(walletConfig.key, key))
    .limit(1);

  const row = rows[0];
  if (!row || !row.value) return null;

  return row.value;
}

/**
 * Read a required wallet config value — throws if missing or inactive.
 * Use for config that must exist for the system to operate (rpc_url, wallet_public_key).
 */
export async function getRequiredWalletConfig(
  db: DbClient,
  key: string,
): Promise<string> {
  const value = await getWalletConfig(db, key);
  if (value === null) {
    throw new Error(
      `Required wallet config key '${key}' is missing or inactive in wallet_config table`,
    );
  }
  return value;
}

/**
 * Upsert a wallet config value. Updates value and updatedAt if key exists,
 * inserts a new row if not. Allows the AI to update its own configuration at runtime.
 */
export async function setWalletConfig(
  db: DbClient,
  key: string,
  value: string,
  description?: string,
): Promise<void> {
  const existing = await db
    .select({ id: walletConfig.id })
    .from(walletConfig)
    .where(eq(walletConfig.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(walletConfig)
      .set({
        value,
        updatedAt: new Date(),
        ...(description !== undefined ? { description } : {}),
      })
      .where(eq(walletConfig.key, key));
  } else {
    await db.insert(walletConfig).values({
      key,
      value,
      description,
      active: true,
    });
  }
}
