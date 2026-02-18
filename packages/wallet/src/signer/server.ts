/**
 * Signing co-process — runs as an isolated Node.js process.
 *
 * Security model:
 * - Private key is loaded ONLY here. It never appears in IPC messages, logs, or exports.
 * - Only the public key address is logged at startup for verification.
 * - IPC authentication uses HMAC-SHA256 with timing-safe comparison.
 * - Unix socket permissions are set to 0o600 after bind (defense in depth).
 * - After listening, sends 'ready' via process.send() so the parent process knows
 *   the socket is accepting connections.
 *
 * Input/output (newline-delimited JSON over Unix socket):
 * - Receives SignRequest (hmac, txBase64, requestId)
 * - Signs the txBase64 bytes using the loaded Ed25519 private key
 * - Returns SignResponse with the 64-byte signature encoded as base64
 */

import { createServer, type Socket } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { unlinkSync, chmodSync, existsSync } from 'node:fs';
import { createKeyPairFromBytes, createKeyPairFromPrivateKeyBytes, signBytes, getAddressFromPublicKey } from '@solana/kit';
import bs58 from 'bs58';
import { SignRequest, type SignResponse } from './protocol.js';

// ─── Env var validation ───────────────────────────────────────────────────────

const SOCKET_PATH = process.env.SIGNER_SOCKET_PATH ?? '/tmp/jarvis-signer.sock';
const SHARED_SECRET = process.env.SIGNER_SHARED_SECRET;
const SOLANA_PRIVATE_KEY_RAW = process.env.SOLANA_PRIVATE_KEY;

if (!SHARED_SECRET) {
  console.error('[signer] FATAL: SIGNER_SHARED_SECRET env var is required');
  process.exit(1);
}

if (!SOLANA_PRIVATE_KEY_RAW) {
  console.error('[signer] FATAL: SOLANA_PRIVATE_KEY env var is required');
  process.exit(1);
}

// ─── Keypair loading ──────────────────────────────────────────────────────────

async function loadKeyPair(): Promise<CryptoKeyPair> {
  // SOLANA_PRIVATE_KEY_RAW validated non-null above
  const raw = SOLANA_PRIVATE_KEY_RAW!.trim();

  // Support JSON array-of-numbers format (Solana CLI keypair files)
  if (raw.startsWith('[')) {
    const nums: number[] = JSON.parse(raw) as number[];
    const bytes = new Uint8Array(nums);
    // Solana CLI files are 64-byte arrays (private key bytes followed by public key bytes)
    if (bytes.length === 64) {
      return createKeyPairFromBytes(bytes);
    }
    // 32-byte private key only
    return createKeyPairFromPrivateKeyBytes(bytes);
  }

  // Support base58 format (standard Solana private key encoding)
  const bytes = bs58.decode(raw);
  if (bytes.length === 64) {
    return createKeyPairFromBytes(bytes);
  }
  return createKeyPairFromPrivateKeyBytes(bytes);
}

// ─── HMAC helper ─────────────────────────────────────────────────────────────

function verifyHmac(txBase64: string, receivedHex: string): boolean {
  const expected = createHmac('sha256', SHARED_SECRET!).update(txBase64).digest();
  let received: Buffer;
  try {
    received = Buffer.from(receivedHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(line: string, socket: Socket, keyPair: CryptoKeyPair): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    const resp: SignResponse = { ok: false, error: 'invalid_tx', requestId: 'unknown' };
    socket.write(JSON.stringify(resp) + '\n');
    return;
  }

  const result = SignRequest.safeParse(parsed);
  if (!result.success) {
    const resp: SignResponse = { ok: false, error: 'invalid_tx', requestId: 'unknown' };
    socket.write(JSON.stringify(resp) + '\n');
    return;
  }

  const { hmac, txBase64, requestId } = result.data;

  // HMAC verification with timing-safe comparison — reject forged requests
  if (!verifyHmac(txBase64, hmac)) {
    const resp: SignResponse = { ok: false, error: 'auth_failed', requestId };
    socket.write(JSON.stringify(resp) + '\n');
    return;
  }

  // Decode transaction bytes
  let txBytes: Uint8Array;
  try {
    txBytes = Buffer.from(txBase64, 'base64');
    if (txBytes.length === 0) throw new Error('empty transaction bytes');
  } catch {
    const resp: SignResponse = { ok: false, error: 'invalid_tx', requestId };
    socket.write(JSON.stringify(resp) + '\n');
    return;
  }

  // Sign the transaction bytes using the loaded private key
  try {
    const signatureBytes = await signBytes(keyPair.privateKey, txBytes);
    // Return the 64-byte Ed25519 signature encoded as base64
    const signedTxBase64 = Buffer.from(signatureBytes).toString('base64');
    const resp: SignResponse = { ok: true, signedTxBase64, requestId };
    socket.write(JSON.stringify(resp) + '\n');
  } catch (err) {
    console.error('[signer] Signing error:', (err as Error).message);
    const resp: SignResponse = { ok: false, error: 'sign_error', requestId };
    socket.write(JSON.stringify(resp) + '\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const keyPair = await loadKeyPair();
  const address = await getAddressFromPublicKey(keyPair.publicKey);
  // Log only the public key — private key material NEVER appears in logs
  console.log(`[signer] Loaded keypair. Public key: ${String(address)}`);

  // Remove stale socket file if it exists from a previous run
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // Ignore — server.listen will fail if truly unusable
    }
  }

  const server = createServer((socket: Socket) => {
    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return; // Wait for complete newline-delimited message

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      void handleRequest(line, socket, keyPair);
    });

    socket.on('error', (err: Error) => {
      const code = (err as NodeJS.ErrnoException).code;
      console.error('[signer] Socket error:', code ?? err.message);
    });
  });

  server.listen(SOCKET_PATH, () => {
    // Set socket file permissions to 0o600 (owner read/write only) — defense in depth
    try {
      chmodSync(SOCKET_PATH, 0o600);
    } catch (err) {
      console.error('[signer] Warning: could not set socket permissions:', (err as Error).message);
    }

    console.log(`[signer] Listening on ${SOCKET_PATH}`);

    // Signal parent process that the signer is ready to accept connections
    // Guard with if (process.send) so the server can also run standalone without IPC
    if (process.send) {
      process.send('ready');
    }
  });

  // Graceful shutdown — unlink socket and exit cleanly
  function shutdown(): void {
    console.log('[signer] Shutting down...');
    server.close(() => {
      try {
        if (existsSync(SOCKET_PATH)) {
          unlinkSync(SOCKET_PATH);
        }
      } catch {
        // Ignore cleanup errors on shutdown
      }
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('[signer] FATAL startup error:', (err as Error).message);
  process.exit(1);
});
