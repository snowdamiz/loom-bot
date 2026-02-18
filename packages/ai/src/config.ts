import { z } from 'zod';

/**
 * Tier names for AI model selection.
 * 'strong' = highest capability, 'mid' = balanced, 'cheap' = fastest/cheapest.
 */
export type Tier = 'strong' | 'mid' | 'cheap';

/**
 * Maps tier names to concrete OpenRouter model IDs.
 * Configurable via environment variables — no redeploy needed to swap models.
 */
export interface ModelTierConfig {
  strong: string;
  mid: string;
  cheap: string;
}

export const modelTierConfigSchema = z.object({
  strong: z.string(),
  mid: z.string(),
  cheap: z.string(),
});

/**
 * Load model tier configuration from environment variables.
 * Defaults match user decision from Phase 2 research:
 *   strong = anthropic/claude-opus-4.6
 *   mid    = anthropic/claude-sonnet-4.5
 *   cheap  = x-ai/grok-4.1-fast
 *
 * Override by setting JARVIS_MODEL_STRONG, JARVIS_MODEL_MID, JARVIS_MODEL_CHEAP.
 */
export function loadModelConfig(): ModelTierConfig {
  const raw = {
    strong: process.env.JARVIS_MODEL_STRONG ?? 'anthropic/claude-opus-4.6',
    mid: process.env.JARVIS_MODEL_MID ?? 'anthropic/claude-sonnet-4.5',
    cheap: process.env.JARVIS_MODEL_CHEAP ?? 'x-ai/grok-4.1-fast',
  };

  return modelTierConfigSchema.parse(raw);
}
