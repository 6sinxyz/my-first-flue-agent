import { defineAgent } from '@flue/runtime';
import { makeWebTools } from '../lib/demos/web-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Browser/web extraction demo using a safe fetch extraction fallback unless a Cloudflare Browser binding is wired.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a web extraction agent. Use fetch_extract for every URL. Mention whether the run used Cloudflare Browser binding or the fetch fallback, and include useful citations/links from the extraction.',
  tools: makeWebTools(env),
}));
