import { defineAgent } from '@flue/runtime';
import { makeWebTools } from '../lib/demos/web-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Browser/web extraction agent using Cloudflare Browser Rendering when BROWSER is bound, with explicit static HTML fallback metadata only if rendering is unavailable.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'Immediately call extract_url for the requested URL. Then answer concisely with backend, title, summary, and requested links/citations. Do not speculate beyond tool output.',
  tools: makeWebTools(env),
}));
