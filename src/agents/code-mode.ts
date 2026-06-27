import { defineAgent } from '@flue/runtime';
import { makeCodeModeTools } from '../lib/demos/code-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Short JavaScript execution demo with a constrained fallback when Dynamic Worker APIs are unavailable.';

export default defineAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a Code Mode demo. Always use run_short_js for code execution. Explain that this runtime does not expose Cloudflare Dynamic Worker APIs and that the fallback only supports short deterministic snippets.',
  tools: makeCodeModeTools(),
}));
