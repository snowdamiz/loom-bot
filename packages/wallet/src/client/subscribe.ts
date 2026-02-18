import { Connection, PublicKey, KeyedAccountInfo, Context } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { DbClient } from '@jarvis/db';
import { getRequiredWalletConfig, WalletConfigKeys } from './config.js';

/**
 * Inbound event discriminated union — fired when tokens arrive in the wallet.
 *
 * 'sol': Native SOL balance changed (via accountSubscribe)
 * 'token': SPL token balance changed (via programSubscribe for TOKEN_PROGRAM_ID
 *           and TOKEN_2022_PROGRAM_ID, filtered to wallet-owned accounts)
 */
export type InboundEvent =
  | { type: 'sol'; lamports: string }
  | { type: 'token'; mint: string; amount: string; decimals: number };

/** Maximum consecutive reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10;

/** Wait time between reconnection attempts (ms) */
const RECONNECT_DELAY_MS = 5_000;

/**
 * Parse a token account data buffer from @solana/web3.js programSubscribe notification.
 * Token account layout (165 bytes for TOKEN_PROGRAM_ID):
 *   - 0-31: mint address (32 bytes)
 *   - 32-63: owner address (32 bytes)
 *   - 64-71: amount (8 bytes, little-endian u64)
 *   - 72-75: delegate option (4 bytes)
 *   - 76-107: delegate (32 bytes)
 *   - 108: state (1 byte)
 *   - 109-112: is_native option (4 bytes)
 *   - 113-120: delegated_amount (8 bytes)
 *   - 121-124: close_authority option (4 bytes)
 *   - 125-156: close_authority (32 bytes)
 *
 * Returns null if the buffer is too short or parsing fails.
 */
function parseTokenAccountData(data: Buffer): {
  mint: string;
  owner: string;
  amount: bigint;
} | null {
  // Standard token account data is 165 bytes
  if (data.length < 165) return null;

  try {
    const mintBytes = data.slice(0, 32);
    const ownerBytes = data.slice(32, 64);
    const amountBytes = data.slice(64, 72);

    const mintPubkey = new PublicKey(mintBytes);
    const ownerPubkey = new PublicKey(ownerBytes);

    // Amount is stored as little-endian u64
    const amount = amountBytes.readBigUInt64LE(0);

    return {
      mint: mintPubkey.toBase58(),
      owner: ownerPubkey.toBase58(),
      amount,
    };
  } catch {
    return null;
  }
}

/**
 * Subscribe to inbound SOL and SPL token transfers for the agent's wallet.
 *
 * Uses @solana/web3.js v1 Connection subscriptions:
 * - accountSubscribe: monitors native SOL balance changes
 * - programSubscribe x2: monitors TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID accounts
 *   owned by the wallet's public key (memcmp filter on owner field at offset 32)
 *
 * Reconnection: if any subscription closes unexpectedly, waits RECONNECT_DELAY_MS
 * and retries all three subscriptions. Gives up after MAX_RECONNECT_ATTEMPTS consecutive
 * failures. Each successful reconnect resets the consecutive failure counter.
 *
 * @param db         Database client (used to read wallet config)
 * @param onInbound  Callback fired on each inbound transfer event
 * @returns          Object with stop() method to unsubscribe and halt reconnection
 */
export async function subscribeToWallet(
  db: DbClient,
  onInbound: (event: InboundEvent) => void,
): Promise<{ stop: () => void }> {
  const wssUrl = await getRequiredWalletConfig(db, WalletConfigKeys.WSS_URL);
  const publicKeyStr = await getRequiredWalletConfig(db, WalletConfigKeys.WALLET_PUBLIC_KEY);

  const walletPublicKey = new PublicKey(publicKeyStr);

  let stopped = false;
  let solSubscriptionId: number | null = null;
  let tokenSubscriptionId: number | null = null;
  let token2022SubscriptionId: number | null = null;
  let connection: Connection | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Unsubscribe all active subscriptions from the current connection.
   * Safe to call multiple times or when some subscriptions are null.
   */
  async function unsubscribeAll(conn: Connection): Promise<void> {
    const pending: Promise<void>[] = [];

    if (solSubscriptionId !== null) {
      pending.push(
        conn.removeAccountChangeListener(solSubscriptionId).catch(() => {
          // Ignore errors on cleanup
        }),
      );
      solSubscriptionId = null;
    }

    if (tokenSubscriptionId !== null) {
      pending.push(
        conn.removeProgramAccountChangeListener(tokenSubscriptionId).catch(() => {
          // Ignore errors on cleanup
        }),
      );
      tokenSubscriptionId = null;
    }

    if (token2022SubscriptionId !== null) {
      pending.push(
        conn.removeProgramAccountChangeListener(token2022SubscriptionId).catch(() => {
          // Ignore errors on cleanup
        }),
      );
      token2022SubscriptionId = null;
    }

    await Promise.all(pending);
  }

  /**
   * Set up all three subscriptions on a fresh connection.
   * Called on initial connect and on reconnect.
   */
  function connect(): void {
    if (stopped) return;

    connection = new Connection(wssUrl, {
      commitment: 'confirmed',
      wsEndpoint: wssUrl,
    });

    // --- SOL subscription: accountSubscribe on the wallet address ---
    // Fires on every SOL balance change (both inbound and outbound).
    // The callback receives the new lamport balance.
    solSubscriptionId = connection.onAccountChange(
      walletPublicKey,
      (accountInfo, _context) => {
        const lamports = accountInfo.lamports.toString();
        onInbound({ type: 'sol', lamports });
      },
      'confirmed',
    );

    // --- SPL TOKEN_PROGRAM_ID subscription: filter by owner at offset 32 ---
    // The token account data layout has the owner address at bytes 32-63.
    // memcmp filter at offset 32 scopes to accounts owned by walletPublicKey.
    const ownerBase58 = walletPublicKey.toBase58();

    tokenSubscriptionId = connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      (keyedAccountInfo: KeyedAccountInfo, _context: Context) => {
        const data = keyedAccountInfo.accountInfo.data as Buffer;
        const parsed = parseTokenAccountData(data);
        if (!parsed) return;

        // Only fire for accounts owned by our wallet
        if (parsed.owner !== ownerBase58) return;

        onInbound({
          type: 'token',
          mint: parsed.mint,
          amount: parsed.amount.toString(),
          decimals: 0, // Decimals not in raw token account data; caller can query if needed
        });
      },
      'confirmed',
      [
        {
          memcmp: {
            offset: 32, // Owner field starts at byte 32
            bytes: ownerBase58,
          },
        },
      ],
    );

    // --- SPL TOKEN_2022_PROGRAM_ID subscription ---
    token2022SubscriptionId = connection.onProgramAccountChange(
      TOKEN_2022_PROGRAM_ID,
      (keyedAccountInfo: KeyedAccountInfo, _context: Context) => {
        const data = keyedAccountInfo.accountInfo.data as Buffer;
        const parsed = parseTokenAccountData(data);
        if (!parsed) return;

        if (parsed.owner !== ownerBase58) return;

        onInbound({
          type: 'token',
          mint: parsed.mint,
          amount: parsed.amount.toString(),
          decimals: 0,
        });
      },
      'confirmed',
      [
        {
          memcmp: {
            offset: 32,
            bytes: ownerBase58,
          },
        },
      ],
    );

    // Register WebSocket close handler for reconnection
    // @solana/web3.js exposes _rpcWebSocket on Connection for raw WS access.
    // We use the 'close' event to detect unexpected disconnections.
    const rawWs = (connection as unknown as { _rpcWebSocket?: { on(event: string, cb: () => void): void } })._rpcWebSocket;
    if (rawWs) {
      rawWs.on('close', () => {
        if (stopped) return;

        process.stderr.write(
          `[wallet/subscribe] WebSocket closed unexpectedly. Reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}\n`,
        );

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          process.stderr.write(
            `[wallet/subscribe] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.\n`,
          );
          return;
        }

        reconnectAttempts++;

        reconnectTimer = setTimeout(() => {
          if (stopped) return;
          process.stderr.write(`[wallet/subscribe] Reconnecting...\n`);
          connect();
        }, RECONNECT_DELAY_MS);
      });
    }

    // Reset consecutive failure counter on successful connect
    reconnectAttempts = 0;

    process.stderr.write(
      `[wallet/subscribe] Subscribed to wallet ${publicKeyStr} (SOL + TOKEN_PROGRAM_ID + TOKEN_2022_PROGRAM_ID)\n`,
    );
  }

  // Initial connection
  connect();

  return {
    stop(): void {
      stopped = true;

      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (connection !== null) {
        void unsubscribeAll(connection);
        connection = null;
      }

      process.stderr.write(`[wallet/subscribe] Wallet subscription stopped.\n`);
    },
  };
}
