import { z } from 'zod';
import { sql } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';

/**
 * IDENT-04: Identity retirement with credential archival.
 *
 * Transitioning an identity to 'retired' also archives all its credentials.
 * Per locked decision: "retired identity = archived credentials"
 *
 * Status lifecycle: active | suspended | retired | archived
 */

export function createRetireIdentityTool(db: DbClient): ToolDefinition {
  return {
    name: 'identity_retire',
    description:
      'Retire an identity and archive all its credentials. ' +
      'Sets the identity status to "retired" and marks all associated credentials as "archived". ' +
      'This is irreversible — use when an identity is no longer needed or has been compromised. ' +
      'Returns the count of credentials that were archived.',
    inputSchema: z.object({
      identityId: z.string().uuid().describe('The UUID of the identity to retire'),
      reason: z
        .string()
        .min(1)
        .describe('Why this identity is being retired — appended to notes for audit trail'),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { identityId, reason } = input as { identityId: string; reason: string };

      // Update identity status to 'retired' and append reason to notes
      await db.execute(sql`
        UPDATE identities
        SET
          status = 'retired',
          retired_at = now(),
          notes = CASE
            WHEN notes IS NULL THEN ${`Retired: ${reason}`}
            ELSE notes || ${`\nRetired: ${reason}`}
          END
        WHERE id = ${identityId}
          AND status != 'retired'
      `);

      // Archive all active/rotated credentials for this identity
      const archiveResult = await db.execute(sql`
        UPDATE credentials
        SET status = 'archived'
        WHERE identity_id = ${identityId}
          AND status IN ('active', 'rotated')
        RETURNING id
      `);

      const credentialsArchived = (archiveResult.rows as unknown[]).length;

      return {
        retired: true,
        credentialsArchived,
      };
    },
  };
}
