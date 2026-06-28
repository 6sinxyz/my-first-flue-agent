import { defineAgent } from '@flue/runtime';
import { makeCodeModeTools } from '../lib/demos/code-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Deterministic arithmetic evaluator for short expressions.';

export default defineAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'You are a deterministic arithmetic evaluator. Always use run_short_js for arithmetic expressions, then explain the result concisely. Be clear that this tool supports arithmetic expressions only, not general JavaScript execution.',
  tools: makeCodeModeTools(),
}));
