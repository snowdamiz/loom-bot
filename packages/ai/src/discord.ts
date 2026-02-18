import { Client, GatewayIntentBits, Partials } from 'discord.js';

/**
 * Send a direct message to the operator via Discord bot.
 *
 * Creates a short-lived Discord client per message — this is intentional.
 * DMs are sent infrequently (only on low-credit alerts), so connection setup
 * overhead is acceptable. A persistent client would be wasteful for Phase 2.
 *
 * IMPORTANT: Partials.Channel is required for DM support in discord.js v14.
 * Without it, the client cannot receive or send DMs.
 */
export async function sendOperatorDm(
  token: string,
  operatorUserId: string,
  message: string,
): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  await client.login(token);

  // Wait for client to be fully ready before attempting to fetch user/send DM
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));

  const user = await client.users.fetch(operatorUserId);
  await user.send(message);

  // Clean up the connection — do not leave the bot online after sending
  await client.destroy();
}
