import { createSolanaRpc, address } from '@solana/kit';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { DbClient } from '@jarvis/db';
import { getRequiredWalletConfig, WalletConfigKeys } from './config.js';

/**
 * Token balance for a single SPL token holding.
 * Amount is stored as string for BigInt safety (avoids float precision loss on large lamport values).
 */
export interface TokenBalance {
  /** SPL token mint address in base58 */
  mint: string;
  /** Raw token amount as a string (use with token's decimals for display) */
  amount: string;
  /** Number of decimal places for the token */
  decimals: number;
  /** Convenience float: amount / 10^decimals — may lose precision for very large holdings */
  uiAmount: number;
}

/**
 * Combined wallet balance result for SOL and all SPL token holdings.
 */
export interface WalletBalances {
  sol: {
    /** Raw lamport balance as a string for BigInt safety */
    lamports: string;
    /** Convenience float: lamports / 1e9 */
    sol: number;
  };
  /** All SPL token balances across TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID */
  tokens: TokenBalance[];
}

/**
 * Strip API keys or tokens from RPC URL for safe error logging.
 * Removes query parameters which may contain API keys.
 */
function sanitizeRpcUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

/**
 * Query SOL and all SPL token balances for the agent's wallet.
 *
 * - SOL balance: uses @solana/kit createSolanaRpc (v2 API)
 * - SPL token balances: uses @solana/web3.js v1 Connection.getParsedTokenAccountsByOwner
 *   queried against both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
 *
 * RPC URL and wallet public key are read from wallet_config DB table (not env vars).
 * On RPC failure, throws a descriptive error — the agent's decision loop handles retries.
 */
export async function getBalances(db: DbClient): Promise<WalletBalances> {
  const rpcUrl = await getRequiredWalletConfig(db, WalletConfigKeys.RPC_URL);
  const publicKeyStr = await getRequiredWalletConfig(
    db,
    WalletConfigKeys.WALLET_PUBLIC_KEY,
  );

  // --- SOL balance via @solana/kit v2 ---
  let lamports: bigint;
  try {
    const rpc = createSolanaRpc(rpcUrl);
    const walletAddress = address(publicKeyStr);
    const result = await rpc.getBalance(walletAddress).send();
    lamports = result.value;
  } catch (err) {
    const safeUrl = sanitizeRpcUrl(rpcUrl);
    throw new Error(
      `Failed to fetch SOL balance from RPC ${safeUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- SPL token balances via @solana/web3.js v1 ---
  let tokens: TokenBalance[];
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const owner = new PublicKey(publicKeyStr);

    const [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [
      ...tokenAccounts.value,
      ...token2022Accounts.value,
    ];

    tokens = allAccounts
      .map((accountInfo) => {
        const parsed = accountInfo.account.data.parsed;
        const info = parsed?.info as {
          mint?: string;
          tokenAmount?: {
            amount?: string;
            decimals?: number;
            uiAmount?: number | null;
          };
        };
        const mint = info?.mint ?? '';
        const tokenAmount = info?.tokenAmount ?? {};
        const amount = tokenAmount.amount ?? '0';
        const decimals = tokenAmount.decimals ?? 0;
        const uiAmount = tokenAmount.uiAmount ?? 0;

        return { mint, amount, decimals, uiAmount } satisfies TokenBalance;
      })
      .filter((t) => t.mint !== '');
  } catch (err) {
    const safeUrl = sanitizeRpcUrl(rpcUrl);
    throw new Error(
      `Failed to fetch SPL token balances from RPC ${safeUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    sol: {
      lamports: lamports.toString(),
      sol: Number(lamports) / 1e9,
    },
    tokens,
  };
}
