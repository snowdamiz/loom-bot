import { Solver } from '@2captcha/captcha-solver';

/**
 * CaptchaSolver wraps the 2captcha API for automated CAPTCHA resolution.
 *
 * If no apiKey is provided, the solver is disabled — the agent should escalate
 * to the operator for manual CAPTCHA resolution.
 *
 * Supported types: reCAPTCHA v2, hCaptcha, Cloudflare Turnstile.
 *
 * Usage:
 *   const solver = new CaptchaSolver({ apiKey: process.env.TWO_CAPTCHA_API_KEY });
 *   if (solver.isAvailable()) {
 *     const token = await solver.solveRecaptchaV2(pageUrl, siteKey);
 *   }
 */
export class CaptchaSolver {
  private readonly solver: Solver | null;

  constructor({ apiKey }: { apiKey?: string }) {
    this.solver = apiKey ? new Solver(apiKey) : null;
  }

  /**
   * Returns true if a 2captcha API key was configured.
   */
  isAvailable(): boolean {
    return this.solver !== null;
  }

  /**
   * Solve a reCAPTCHA v2 challenge.
   * @param pageUrl - The URL of the page containing the CAPTCHA
   * @param siteKey - The reCAPTCHA site key from the page
   * @returns The g-recaptcha-response token to submit
   */
  async solveRecaptchaV2(pageUrl: string, siteKey: string): Promise<string> {
    this.requireApiKey('solveRecaptchaV2');
    const result = await this.solver!.recaptcha({
      pageurl: pageUrl,
      googlekey: siteKey,
    });
    return result.data;
  }

  /**
   * Solve an hCaptcha challenge.
   * @param pageUrl - The URL of the page containing the CAPTCHA
   * @param siteKey - The hCaptcha site key from the page
   * @returns The h-captcha-response token to submit
   */
  async solveHCaptcha(pageUrl: string, siteKey: string): Promise<string> {
    this.requireApiKey('solveHCaptcha');
    const result = await this.solver!.hcaptcha({
      pageurl: pageUrl,
      sitekey: siteKey,
    });
    return result.data;
  }

  /**
   * Solve a Cloudflare Turnstile challenge.
   * @param pageUrl - The URL of the page containing the CAPTCHA
   * @param siteKey - The Turnstile site key from the page
   * @returns The cf-turnstile-response token to submit
   */
  async solveTurnstile(pageUrl: string, siteKey: string): Promise<string> {
    this.requireApiKey('solveTurnstile');
    const result = await this.solver!.cloudflareTurnstile({
      pageurl: pageUrl,
      sitekey: siteKey,
    });
    return result.data;
  }

  private requireApiKey(method: string): void {
    if (!this.solver) {
      throw new Error(
        `CaptchaSolver.${method}: CAPTCHA_API_KEY not configured — ` +
          'set TWO_CAPTCHA_API_KEY env var or escalate to operator'
      );
    }
  }
}
