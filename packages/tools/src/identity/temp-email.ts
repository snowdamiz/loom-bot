import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * IDENT-05: Temporary email creation and polling via Guerrilla Mail API.
 *
 * Two tools:
 * 1. temp_email_create — get a fresh throwaway email address + session token
 * 2. temp_email_check — poll for new emails (with rate-limit-safe delays)
 *
 * Guerrilla Mail API: http://api.guerrillamail.com/ajax.php
 * Rate limit safety: minimum 5 seconds between polls, max 10 attempts.
 */

interface GuerrillaEmailResponse {
  email_addr: string;
  sid_token: string;
}

interface GuerrillaEmailListResponse {
  list: GuerrillaEmail[] | null;
}

interface GuerrillaEmail {
  mail_id: string;
  mail_subject: string;
  mail_from: string;
  mail_timestamp: string;
}

interface GuerrillaEmailFetchResponse {
  mail_body: string;
  mail_subject: string;
}

/**
 * Factory: temp_email_create ToolDefinition.
 * Returns a Guerrilla Mail throwaway address and session token.
 */
export function createTempEmailTool(): ToolDefinition {
  return {
    name: 'temp_email_create',
    description:
      'Create a temporary throwaway email address via Guerrilla Mail. ' +
      'Returns an email address and a session token (sidToken). ' +
      'Use temp_email_check with the sidToken to poll for incoming messages. ' +
      'Useful for account verification flows where you need a real email that receives messages.',
    inputSchema: z.object({}),
    timeoutMs: 30_000,
    execute: async (_input, _signal) => {
      const response = await fetch('http://api.guerrillamail.com/ajax.php?f=get_email_address');
      if (!response.ok) {
        throw new Error(`Guerrilla Mail API error: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as GuerrillaEmailResponse;
      return {
        emailAddress: data.email_addr,
        sidToken: data.sid_token,
      };
    },
  };
}

/**
 * Factory: temp_email_check ToolDefinition.
 * Polls for emails received at a Guerrilla Mail address.
 *
 * Uses a minimum 5-second delay between polls to avoid rate limiting.
 * Gives up after 10 attempts (timeoutMs worth of waiting).
 */
export function createCheckTempEmailTool(): ToolDefinition {
  return {
    name: 'temp_email_check',
    description:
      'Poll a Guerrilla Mail inbox for new messages. ' +
      'Requires a sidToken from temp_email_create. ' +
      'Waits up to timeoutMs (default 60s) for an email to arrive, ' +
      'checking every 5 seconds (max 10 attempts). ' +
      'Returns the email body and subject if found, or { found: false } on timeout.',
    inputSchema: z.object({
      sidToken: z.string().min(1).describe('Session token from temp_email_create'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .default(60_000)
        .describe('Max wait time in milliseconds. Default: 60000 (60 seconds).'),
    }),
    timeoutMs: 90_000,
    execute: async (input, signal) => {
      const { sidToken, timeoutMs = 60_000 } = input as {
        sidToken: string;
        timeoutMs: number;
      };

      const POLL_INTERVAL_MS = 5_000;
      const MAX_ATTEMPTS = 10;
      const maxAttempts = Math.min(MAX_ATTEMPTS, Math.ceil(timeoutMs / POLL_INTERVAL_MS));

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal.aborted) {
          return { found: false };
        }

        // Poll for email list
        const listUrl = `http://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${encodeURIComponent(sidToken)}`;
        const listResponse = await fetch(listUrl);

        if (listResponse.ok) {
          const listData = (await listResponse.json()) as GuerrillaEmailListResponse;
          const emails = listData.list;

          if (emails && emails.length > 0) {
            // Fetch full body of the first email
            const emailId = emails[0].mail_id;
            const fetchUrl = `http://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${encodeURIComponent(emailId)}&sid_token=${encodeURIComponent(sidToken)}`;
            const fetchResponse = await fetch(fetchUrl);

            if (fetchResponse.ok) {
              const emailData = (await fetchResponse.json()) as GuerrillaEmailFetchResponse;
              return {
                found: true,
                subject: emailData.mail_subject,
                body: emailData.mail_body,
              };
            }
          }
        }

        // Wait 5 seconds before next poll (anti-rate-limit)
        if (attempt < maxAttempts - 1) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, POLL_INTERVAL_MS);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            }, { once: true });
          }).catch(() => {
            // Aborted during wait — exit loop
          });
        }

        if (signal.aborted) {
          return { found: false };
        }
      }

      return { found: false };
    },
  };
}
