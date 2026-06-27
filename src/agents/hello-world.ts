import { defineAgent, type AgentRouteHandler } from '@flue/runtime';

export const route: AgentRouteHandler = async (_c, next) => next();

export default defineAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a concise hello-world assistant. Reply warmly and briefly to the user message, and mention that this Flue agent is running on the Cloudflare target.',
}));
