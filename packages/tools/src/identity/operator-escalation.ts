import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * IDENT-05: Operator credential escalation via Discord DM.
 *
 * When the agent needs credentials it doesn't have (e.g. operator API keys,
 * account logins only the operator knows), it sends a Discord DM to the operator
 * requesting those credentials.
 *
 * This is fire-and-forget: the tool does NOT wait for a reply.
 * The operator is expected to store the credential via credential_store when ready.
 *
 * Pattern: same as sendOperatorDm in @jarvis/ai (Phase 3), but implemented
 * inline here to avoid cross-package dependency (pnpm strict isolation).
 *
 * Falls back gracefully if DISCORD_TOKEN is not configured.
 */

export function createRequestOperatorCredentialsTool(): ToolDefinition {
  return {
    name: 'request_operator_credentials',
    description:
      'Request credentials from the operator via Discord DM. ' +
      'Use when the agent needs API keys, passwords, or tokens that only the operator can provide. ' +
      'The operator will receive a DM and can provide the credentials via credential_store. ' +
      'This tool does NOT wait for a response — check back later using credential_retrieve.',
    inputSchema: z.object({
      service: z
        .string()
        .min(1)
        .describe('The service/platform the credentials are needed for, e.g. "stripe", "twitter"'),
      credentialType: z
        .string()
        .min(1)
        .describe('Type of credential needed, e.g. "api_key", "password", "oauth_token"'),
      reason: z
        .string()
        .min(1)
        .describe('Why the agent needs this credential — shown to the operator in the DM'),
    }),
    timeoutMs: 30_000,
    execute: async (input, _signal) => {
      const { service, credentialType, reason } = input as {
        service: string;
        credentialType: string;
        reason: string;
      };

      const token = process.env.DISCORD_TOKEN;
      const operatorUserId = process.env.DISCORD_OPERATOR_USER_ID;

      if (!token || !operatorUserId) {
        return {
          requested: false,
          error: 'DISCORD_TOKEN not configured — cannot reach operator',
        };
      }

      const message =
        `Jarvis needs your credentials for **${service}** (${credentialType}). ` +
        `Reason: ${reason}. ` +
        `Reply with the credential value or 'deny'.`;

      try {
        // Short-lived Discord client — same pattern as sendOperatorDm in @jarvis/ai
        const { Client, GatewayIntentBits, Partials } = await import('discord.js');

        const client = new Client({
          intents: [GatewayIntentBits.DirectMessages],
          partials: [Partials.Channel],
        });

        await client.login(token);
        await new Promise<void>((resolve) => client.once('ready', () => resolve()));

        const user = await client.users.fetch(operatorUserId);
        await user.send(message);

        // Clean up — do not leave the bot online after sending
        await client.destroy();

        return {
          requested: true,
          message: 'Operator notified via Discord DM. Check back later.',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          requested: false,
          error: `Failed to send Discord DM: ${errorMessage}`,
        };
      }
    },
  };
}
