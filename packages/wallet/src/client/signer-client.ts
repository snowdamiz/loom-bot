import { createConnection } from 'node:net';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { SignRequest, SignResponse } from '../signer/protocol.js';

/**
 * Agent-side IPC client for the signing co-process.
 *
 * Communicates with the signer server over a Unix socket using a newline-delimited
 * JSON protocol. All requests are HMAC-SHA256 authenticated using the shared secret.
 *
 * The private key NEVER crosses the socket — only transaction bytes (in) and
 * signatures (out) are exchanged.
 */
export class SignerClient {
  private readonly socketPath: string;
  private readonly sharedSecret: string;

  constructor(socketPath: string, sharedSecret: string) {
    this.socketPath = socketPath;
    this.sharedSecret = sharedSecret;
  }

  /**
   * Computes HMAC-SHA256 of txBase64 using the shared secret.
   * Produces a 64-character hex string.
   */
  private computeHmac(txBase64: string): string {
    return createHmac('sha256', this.sharedSecret).update(txBase64).digest('hex');
  }

  /**
   * Signs the given transaction bytes (base64-encoded) via the signer co-process.
   *
   * @param txBase64 - The transaction message bytes to sign, encoded as base64
   * @returns The 64-byte Ed25519 signature encoded as base64
   * @throws Error if auth fails, signing fails, or the socket times out
   */
  async signTransaction(txBase64: string): Promise<string> {
    const requestId = randomUUID();
    const hmac = this.computeHmac(txBase64);

    const request: SignRequest = { hmac, txBase64, requestId };
    const requestLine = JSON.stringify(request) + '\n';

    return new Promise<string>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      let buffer = '';
      let settled = false;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
        socket.destroy();
      };

      socket.setTimeout(10_000);

      socket.on('connect', () => {
        socket.write(requestLine);
      });

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;

        const line = buffer.slice(0, newlineIndex);

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          settle(() => reject(new Error('Signer returned invalid JSON')));
          return;
        }

        const result = SignResponse.safeParse(parsed);
        if (!result.success) {
          settle(() => reject(new Error('Signer returned invalid response schema')));
          return;
        }

        const response = result.data;
        if (response.ok) {
          settle(() => resolve(response.signedTxBase64));
        } else {
          settle(() => reject(new Error(`Signer error: ${response.error}`)));
        }
      });

      socket.on('timeout', () => {
        settle(() => reject(new Error('Signer socket timed out after 10s')));
      });

      socket.on('error', (err) => {
        settle(() => reject(new Error(`Signer socket error: ${(err as NodeJS.ErrnoException).code ?? err.message}`)));
      });

      socket.on('end', () => {
        if (!settled) {
          settle(() => reject(new Error('Signer closed connection without responding')));
        }
      });
    });
  }

  /**
   * Checks whether the signer co-process is running and accepting connections.
   *
   * @returns true if a connection can be established, false otherwise
   */
  async ping(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = createConnection(this.socketPath);
      socket.setTimeout(2_000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}
