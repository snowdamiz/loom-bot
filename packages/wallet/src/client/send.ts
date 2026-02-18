import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { DbClient, walletTransactions, desc, eq } from '@jarvis/db';
import type { WalletTransaction } from '@jarvis/db';
import { checkSpendLimits, notifySpendLimitBreach, notifyHighValueTransaction } from '../governance/index.js';
import { getRequiredWalletConfig, WalletConfigKeys } from './config.js';
import { SignerClient } from './signer-client.js';

/**
 * Result returned by all send functions.
 * On rejection, transactionId is still set (the rejected tx is logged).
 */
export interface SendResult {
  success: boolean;
  txSignature?: string;
  error?: string;
  transactionId: number;
}

/**
 * Build an unsigned @solana/web3.js Transaction, serialize the message bytes
 * to base64, sign via IPC, embed the signature, and return the wire-format
 * signed transaction Buffer ready for RPC broadcast.
 *
 * Architecture note: the signer IPC protocol signs raw bytes and returns the
 * 64-byte Ed25519 signature. We serialize the transaction MESSAGE (not the full tx),
 * sign those bytes, then embed the signature back into the Transaction object
 * via addSignature() before serializing the fully-signed transaction.
 *
 * @solana/web3.js v1 approach used here because:
 * - @solana-program/system requires @solana/kit@^6.1.0 (incompatible with our v2.3.0)
 * - @solana/web3.js v1 is already a direct dependency (balance.ts)
 */
async function buildSignAndEncode(
  tx: Transaction,
  payerPublicKey: PublicKey,
  signerClient: SignerClient,
): Promise<Buffer> {
  // Ensure feePayer is set before serializing the message
  tx.feePayer = payerPublicKey;

  // Serialize just the transaction message bytes for signing
  const messageBytes = tx.serializeMessage();
  const messageBase64 = messageBytes.toString('base64');

  // Sign via IPC — returns the 64-byte Ed25519 signature as base64
  const signatureBase64 = await signerClient.signTransaction(messageBase64);
  const signatureBytes = Buffer.from(signatureBase64, 'base64');

  // Embed the signature into the transaction object
  tx.addSignature(payerPublicKey, signatureBytes);

  // Serialize the fully-signed transaction to wire format
  return tx.serialize();
}

/**
 * Send native SOL to a destination address.
 *
 * Full pipeline:
 * 1. Governance check: checkSpendLimits — rejects before signing if limit exceeded
 * 2. Build unsigned Transaction with SystemProgram.transfer instruction
 * 3. Log as 'submitted' to wallet_transactions DB table
 * 4. Sign message bytes via IPC (signerClient.signTransaction)
 * 5. Broadcast via Connection.sendRawTransaction
 * 6. Update DB record with tx_signature and status='confirmed'
 *    (Phase 4 simplification: successful broadcast = confirmed; polling added later)
 * 7. Non-blocking high-value transaction notification
 *
 * On governance rejection: logs rejected tx with rejection_reason, notifies operator,
 * returns { success: false }.
 * On post-submission error: updates status to 'failed'.
 */
export async function sendSol(
  db: DbClient,
  signerClient: SignerClient,
  destination: string,
  amountLamports: string,
  purpose: string,
): Promise<SendResult> {
  const amountLamportsBigInt = BigInt(amountLamports);

  // --- Step 1: Governance check ---
  const governanceResult = await checkSpendLimits(db, amountLamportsBigInt);
  if (!governanceResult.allowed) {
    const reason = governanceResult.reason ?? 'Spend limit check rejected transaction';

    // Log rejected transaction to DB
    const rejectedRows = await db
      .insert(walletTransactions)
      .values({
        tokenMint: 'sol',
        destinationAddress: destination,
        amountLamports,
        purpose,
        status: 'rejected',
        rejectionReason: reason,
      })
      .returning({ id: walletTransactions.id });

    const transactionId = rejectedRows[0]?.id ?? 0;

    // Non-blocking operator breach notification (fire and forget)
    notifySpendLimitBreach(reason, amountLamportsBigInt, purpose).catch((err: unknown) => {
      process.stderr.write(
        `[wallet/send] Breach notification error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });

    return { success: false, error: reason, transactionId };
  }

  // --- Step 2: Build unsigned transaction ---
  const rpcUrl = await getRequiredWalletConfig(db, WalletConfigKeys.RPC_URL);
  const publicKeyStr = await getRequiredWalletConfig(db, WalletConfigKeys.WALLET_PUBLIC_KEY);

  const connection = new Connection(rpcUrl, 'confirmed');
  const payerPublicKey = new PublicKey(publicKeyStr);
  const destinationPublicKey = new PublicKey(destination);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payerPublicKey,
  });

  tx.add(
    SystemProgram.transfer({
      fromPubkey: payerPublicKey,
      toPubkey: destinationPublicKey,
      lamports: Number(amountLamportsBigInt),
    }),
  );

  // --- Step 3: Log as 'submitted' before signing ---
  const submittedRows = await db
    .insert(walletTransactions)
    .values({
      tokenMint: 'sol',
      destinationAddress: destination,
      amountLamports,
      purpose,
      status: 'submitted',
    })
    .returning({ id: walletTransactions.id });

  const transactionId = submittedRows[0]?.id ?? 0;

  try {
    // --- Step 4: Sign via IPC ---
    const rawTransaction = await buildSignAndEncode(tx, payerPublicKey, signerClient);

    // --- Step 5: Broadcast ---
    const txSignature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // --- Step 6: Update DB record ---
    await db
      .update(walletTransactions)
      .set({
        txSignature,
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(eq(walletTransactions.id, transactionId));

    // --- Step 7: Non-blocking high-value notification ---
    notifyHighValueTransaction(amountLamportsBigInt, destination, purpose, db).catch((err: unknown) => {
      process.stderr.write(
        `[wallet/send] High-value notification error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });

    return { success: true, txSignature, transactionId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Update status to 'failed' on any post-submission error
    await db
      .update(walletTransactions)
      .set({ status: 'failed' })
      .where(eq(walletTransactions.id, transactionId));

    return { success: false, error: errorMsg, transactionId };
  }
}

/**
 * Send an SPL token (Token Program or Token-2022) to a destination address.
 *
 * Full pipeline:
 * 0. Governance check: checkSpendLimits — rejects before any RPC or signing if limit exceeded.
 *    Token amount (in base units) is compared against the same lamport-denominated ceilings
 *    used for SOL sends. This is a coarse safety net that prevents unbounded SPL sends.
 *    USD-denominated per-token limits (requiring oracle pricing) are deferred to a future phase.
 * 1. Auto-detect token program (TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID) via mint account owner
 * 2. Get mint decimals from on-chain mint account
 * 3. Get/create source and destination ATAs (ATA creation costs ~0.002 SOL — known Phase 4 limitation)
 * 4. Build createTransferCheckedInstruction with correct program ID and decimals
 * 5. Sign via IPC -> broadcast -> log pipeline
 * 6. Notify high-value (non-blocking)
 *
 * On governance rejection: logs rejected tx with rejection_reason, notifies operator,
 * returns { success: false }.
 * On post-submission error: updates status to 'failed'.
 *
 * NOTE on ATA creation: getOrCreateAssociatedTokenAccount may create an ATA if the
 * destination has never held this token (~0.002 SOL rent-exempt cost). This cost is
 * not included in governance checks — known Phase 4 limitation.
 */
export async function sendSplToken(
  db: DbClient,
  signerClient: SignerClient,
  destination: string,
  mintAddress: string,
  amount: string,
  purpose: string,
): Promise<SendResult> {
  // --- Step 0: Governance check ---
  const governanceResult = await checkSpendLimits(db, BigInt(amount), mintAddress);
  if (!governanceResult.allowed) {
    const reason = governanceResult.reason ?? 'Spend limit check rejected transaction';

    // Log rejected transaction to DB
    const rejectedRows = await db
      .insert(walletTransactions)
      .values({
        tokenMint: mintAddress,
        destinationAddress: destination,
        amountLamports: amount,
        purpose,
        status: 'rejected',
        rejectionReason: reason,
      })
      .returning({ id: walletTransactions.id });

    const transactionId = rejectedRows[0]?.id ?? 0;

    // Non-blocking operator breach notification (fire and forget)
    notifySpendLimitBreach(reason, BigInt(amount), purpose).catch((err: unknown) => {
      process.stderr.write(
        `[wallet/send] Breach notification error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });

    return { success: false, error: reason, transactionId };
  }

  const rpcUrl = await getRequiredWalletConfig(db, WalletConfigKeys.RPC_URL);
  const publicKeyStr = await getRequiredWalletConfig(db, WalletConfigKeys.WALLET_PUBLIC_KEY);

  const connection = new Connection(rpcUrl, 'confirmed');
  const payerPublicKey = new PublicKey(publicKeyStr);
  const destinationPublicKey = new PublicKey(destination);
  const mintPublicKey = new PublicKey(mintAddress);

  // --- Step 1: Auto-detect token program ---
  let tokenProgramId: PublicKey;
  try {
    const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
    if (!mintAccountInfo) {
      throw new Error(`Mint account not found on-chain: ${mintAddress}`);
    }
    tokenProgramId = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const rows = await db
      .insert(walletTransactions)
      .values({
        tokenMint: mintAddress,
        destinationAddress: destination,
        amountLamports: amount,
        purpose,
        status: 'rejected',
        rejectionReason: `Token program detection failed: ${errorMsg}`,
      })
      .returning({ id: walletTransactions.id });

    return {
      success: false,
      error: `Token program detection failed: ${errorMsg}`,
      transactionId: rows[0]?.id ?? 0,
    };
  }

  // --- Step 2: Get mint decimals ---
  let decimals: number;
  try {
    const mintInfo = await getMint(connection, mintPublicKey, 'confirmed', tokenProgramId);
    decimals = mintInfo.decimals;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const rows = await db
      .insert(walletTransactions)
      .values({
        tokenMint: mintAddress,
        destinationAddress: destination,
        amountLamports: amount,
        purpose,
        status: 'rejected',
        rejectionReason: `Failed to fetch mint info: ${errorMsg}`,
      })
      .returning({ id: walletTransactions.id });

    return {
      success: false,
      error: `Failed to fetch mint info: ${errorMsg}`,
      transactionId: rows[0]?.id ?? 0,
    };
  }

  // --- Step 3: Log as 'submitted' ---
  const submittedRows = await db
    .insert(walletTransactions)
    .values({
      tokenMint: mintAddress,
      destinationAddress: destination,
      amountLamports: amount, // Token base units stored here for SPL sends
      purpose,
      status: 'submitted',
    })
    .returning({ id: walletTransactions.id });

  const transactionId = submittedRows[0]?.id ?? 0;

  try {
    // --- Step 3b: Get/create source and destination ATAs ---
    // getOrCreateAssociatedTokenAccount handles both cases:
    //   - Account exists: returns existing ATA
    //   - Account doesn't exist: creates it (costs ~0.002 SOL rent)
    // For IPC signing we cannot directly pass a Signer to getOrCreateAssociatedTokenAccount.
    // Instead, we get ATAs using idempotent create instructions manually if needed,
    // building a separate transaction for ATA creation signed via IPC.
    // For Phase 4, use the idempotent ATA creation via createAssociatedTokenAccountIdempotent
    // to avoid needing a separate signed ATA creation tx.

    // Get the ATA addresses
    const { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } =
      await import('@solana/spl-token');

    const sourceAtaAddress = getAssociatedTokenAddressSync(
      mintPublicKey,
      payerPublicKey,
      false,
      tokenProgramId,
    );
    const destAtaAddress = getAssociatedTokenAddressSync(
      mintPublicKey,
      destinationPublicKey,
      false,
      tokenProgramId,
    );

    // Build transaction with idempotent ATA creation + token transfer
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: payerPublicKey,
    });

    // Idempotent ATA creation instructions (no-op if ATA already exists)
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPublicKey,       // payer
        sourceAtaAddress,     // associated token account
        payerPublicKey,       // owner
        mintPublicKey,        // mint
        tokenProgramId,
      ),
    );
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPublicKey,       // payer
        destAtaAddress,       // associated token account
        destinationPublicKey, // owner
        mintPublicKey,        // mint
        tokenProgramId,
      ),
    );

    // Token transfer instruction
    tx.add(
      createTransferCheckedInstruction(
        sourceAtaAddress,
        mintPublicKey,
        destAtaAddress,
        payerPublicKey,
        BigInt(amount),
        decimals,
        [],
        tokenProgramId,
      ),
    );

    // --- Step 4: Sign via IPC ---
    const rawTransaction = await buildSignAndEncode(tx, payerPublicKey, signerClient);

    // --- Step 5: Broadcast ---
    const txSignature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // --- Step 6: Update DB record ---
    await db
      .update(walletTransactions)
      .set({
        txSignature,
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(eq(walletTransactions.id, transactionId));

    // --- Step 7: Non-blocking notification ---
    notifyHighValueTransaction(BigInt(amount), destination, purpose, db).catch((err: unknown) => {
      process.stderr.write(
        `[wallet/send] High-value notification error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });

    return { success: true, txSignature, transactionId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await db
      .update(walletTransactions)
      .set({ status: 'failed' })
      .where(eq(walletTransactions.id, transactionId));

    return { success: false, error: errorMsg, transactionId };
  }
}

/**
 * Query paginated wallet transaction history, ordered by most recent first.
 * Used by the AI to review past spending and make informed financial decisions.
 *
 * @param limit  Maximum number of records to return (default: 50)
 * @param offset Skip this many records from the top (default: 0)
 */
export async function getTransactionHistory(
  db: DbClient,
  limit = 50,
  offset = 0,
): Promise<WalletTransaction[]> {
  const rows = await db
    .select()
    .from(walletTransactions)
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
