import type { DbClient } from '@jarvis/db';
import { sendOperatorDm } from './discord.js';

/**
 * COST-02: OpenRouter credit balance polling configuration.
 * All fields optional except apiKey — defaults are chosen for a 24/7 agent.
 */
export interface CreditMonitorConfig {
  /** OPENROUTER_API_KEY — required for balance polling */
  apiKey: string;
  /** DISCORD_BOT_TOKEN — optional; DMs are skipped if not set */
  discordBotToken?: string;
  /** DISCORD_OPERATOR_USER_ID — optional; DMs are skipped if not set */
  discordOperatorUserId?: string;
  /** How often to poll balance (ms). Default: 5 minutes */
  checkIntervalMs?: number;
  /**
   * Credits remaining threshold for low-credit alert (USD).
   * Default: $5.00 — chosen per Claude's Discretion to give the operator
   * enough time to top up without the agent running dry mid-task.
   */
  lowCreditThresholdUsd?: number;
}

/** Response shape from GET /api/v1/key */
interface OpenRouterKeyResponse {
  data: {
    limit_remaining: number | null;
    usage: number;
  };
}

/**
 * COST-02: Monitors OpenRouter credit balance via the /api/v1/key endpoint.
 *
 * Uses GET /api/v1/key (NOT /api/v1/credits — that endpoint requires a
 * management key; /api/v1/key works with the standard API key).
 *
 * On low-credit detection, sends a Discord DM to the operator with a
 * 1-hour debounce to prevent notification spam.
 */
export class CreditMonitor {
  private readonly config: Required<
    Omit<CreditMonitorConfig, 'discordBotToken' | 'discordOperatorUserId'>
  > &
    Pick<CreditMonitorConfig, 'discordBotToken' | 'discordOperatorUserId'>;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _db: DbClient;
  /** Timestamp of the last low-credit warning to enforce 1-hour debounce */
  private lastWarningAt: number | null = null;

  constructor(config: CreditMonitorConfig, db: DbClient) {
    this.config = {
      apiKey: config.apiKey,
      discordBotToken: config.discordBotToken,
      discordOperatorUserId: config.discordOperatorUserId,
      checkIntervalMs: config.checkIntervalMs ?? 5 * 60 * 1000,
      lowCreditThresholdUsd: config.lowCreditThresholdUsd ?? 5.0,
    };
    this._db = db;
  }

  /**
   * Fetch current credit balance from OpenRouter.
   * Returns remaining credits (null if account has no credit limit) and usage.
   */
  async checkBalance(): Promise<{ remaining: number | null; usage: number }> {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter /api/v1/key returned ${response.status}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OpenRouterKeyResponse;
    return {
      remaining: body.data.limit_remaining,
      usage: body.data.usage,
    };
  }

  /**
   * Check balance and fire low-credit alert if threshold is crossed.
   * Called on every interval tick and immediately on start().
   */
  async recordBalance(): Promise<void> {
    try {
      const { remaining } = await this.checkBalance();

      if (remaining !== null && remaining < this.config.lowCreditThresholdUsd) {
        const now = Date.now();
        const debounceMs = 60 * 60 * 1000; // 1 hour

        if (this.lastWarningAt === null || now - this.lastWarningAt > debounceMs) {
          this.lastWarningAt = now;

          // Log to stderr — always available even if Discord fails
          process.stderr.write(
            `[cost-monitor] LOW CREDITS: $${remaining.toFixed(2)} remaining\n`,
          );

          if (this.config.discordBotToken && this.config.discordOperatorUserId) {
            try {
              await sendOperatorDm(
                this.config.discordBotToken,
                this.config.discordOperatorUserId,
                `[Jarvis] Low credits warning: $${remaining.toFixed(2)} remaining on OpenRouter. Please top up.`,
              );
            } catch (dmErr) {
              // Discord DM failure is non-fatal — balance was already logged to stderr
              process.stderr.write(
                `[cost-monitor] Failed to send Discord DM: ${dmErr instanceof Error ? dmErr.message : String(dmErr)}\n`,
              );
            }
          }
        }
      }
    } catch (err) {
      process.stderr.write(
        `[cost-monitor] Balance check failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  /**
   * Start periodic balance polling.
   * Calls recordBalance() immediately (same pattern as memory consolidation —
   * processes any missed windows without waiting for the first interval).
   */
  start(): void {
    // Immediate check — do not wait for first interval tick
    void this.recordBalance();

    this.intervalHandle = setInterval(() => {
      void this.recordBalance();
    }, this.config.checkIntervalMs);
  }

  /** Stop periodic balance polling and clear the interval. */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
