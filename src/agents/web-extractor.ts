import { defineAgent } from '@flue/runtime';
import { makeWebTools } from '../lib/demos/web-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Browser/web extraction agent using Cloudflare Browser Rendering when BROWSER is bound, with explicit static HTML fallback metadata only if rendering is unavailable.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a web extraction agent. Use extract_url for every URL. Mention whether the run used Cloudflare Browser binding or the fetch fallback, and include useful citations/links from the extraction.',
  tools: makeWebTools(env),
}));
