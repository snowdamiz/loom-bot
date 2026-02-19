import { z } from 'zod';
import { faker } from '@faker-js/faker';
import { sql } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';
import { storeCredential } from './credential-vault.js';

/**
 * IDENT-01: Synthetic identity generation.
 *
 * Generates a full faker persona with name, email, address, DOB, bio, etc.
 * Inserts the identity into the identities table and stores the generated
 * master password in the credential vault.
 *
 * profilePictureUrl is set to https://thispersondoesnotexist.com —
 * every GET returns a random AI-generated face.
 */

export function createIdentityTool(db: DbClient): ToolDefinition {
  return {
    name: 'identity_create',
    description:
      'Generate a full synthetic persona (fake identity) with name, email, phone, address, ' +
      'date of birth, bio, job title, username, and password. ' +
      'Stores the persona in the database and encrypts the generated password in the credential vault. ' +
      'Use when setting up a new account or browser identity for automation.',
    inputSchema: z.object({
      locale: z
        .string()
        .optional()
        .describe(
          'Faker locale for localized data generation (e.g. "en", "de", "fr"). Defaults to "en".',
        ),
      notes: z.string().optional().describe('Optional notes to attach to this identity.'),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { locale, notes } = input as { locale?: string; notes?: string };

      // Set locale if provided (faker supports locale switching)
      const f = locale && locale !== 'en' ? new (await import('@faker-js/faker')).Faker({ locale: [] }) : faker;

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const fullName = `${firstName} ${lastName}`;

      const persona = {
        firstName,
        lastName,
        phone: faker.phone.number(),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zip: faker.location.zipCode(),
          country: faker.location.country(),
        },
        dateOfBirth: faker.date.birthdate({ min: 25, max: 50, mode: 'age' }).toISOString(),
        bio: faker.person.bio(),
        jobTitle: faker.person.jobTitle(),
        username: faker.internet.username({ firstName, lastName }),
      };

      const email = faker.internet.email({ firstName, lastName });
      const password = faker.internet.password({ length: 16, memorable: false });
      const profilePictureUrl = 'https://thispersondoesnotexist.com';

      // Insert identity into identities table
      const insertResult = await db.execute(sql`
        INSERT INTO identities (id, name, email, persona, profile_picture_url, status, risk_score, created_at, notes)
        VALUES (
          gen_random_uuid(),
          ${fullName},
          ${email},
          ${JSON.stringify(persona)}::jsonb,
          ${profilePictureUrl},
          'active',
          0,
          now(),
          ${notes ?? null}
        )
        RETURNING id
      `);

      const rows = insertResult.rows as Array<{ id: string }>;
      const identityId = rows[0].id;

      // Store generated master password in credential vault
      await storeCredential(db, {
        identityId,
        service: 'identity',
        key: 'master_password',
        value: password,
      });

      return {
        identityId,
        name: fullName,
        email,
        username: persona.username,
      };
    },
  };
}
