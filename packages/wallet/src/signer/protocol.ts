import { z } from 'zod';

/**
 * IPC wire format for the signing co-process.
 *
 * The client sends a SignRequest containing:
 * - hmac: HMAC-SHA256 of txBase64 using the shared secret (hex, 64 chars)
 * - txBase64: the unsigned transaction bytes encoded as base64
 * - requestId: a UUID for log correlation (never logged by the signer itself)
 *
 * The signer responds with a SignResponse discriminated on the `ok` field.
 */

export const SignRequest = z.object({
  /** HMAC-SHA256 of txBase64 using SIGNER_SHARED_SECRET, hex-encoded (64 chars) */
  hmac: z.string().length(64),
  /** Unsigned transaction bytes encoded as base64 */
  txBase64: z.string().min(1),
  /** UUID for log correlation on the client side — the signer never logs this */
  requestId: z.string().uuid(),
});

export type SignRequest = z.infer<typeof SignRequest>;

export const SignResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** Signed transaction bytes encoded as base64 */
    signedTxBase64: z.string(),
    /** Echoed request ID for correlation */
    requestId: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    /** Error code indicating the failure reason */
    error: z.enum(['auth_failed', 'sign_error', 'invalid_tx']),
    /** Echoed request ID for correlation */
    requestId: z.string(),
  }),
]);

export type SignResponse = z.infer<typeof SignResponse>;
