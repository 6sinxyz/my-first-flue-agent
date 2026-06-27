import { defineAgent } from '@flue/runtime';
import { makeEmailTools } from '../lib/demos/email-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Test-mode email payload and CSV link processing demo with cleaning summaries and Cloudflare Email setup notes.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You process test-mode email payloads. Use process_email_payload, list CSV links/attachments, include cleaning summaries, suggested export paths, and data-cleaner handoff prompts. Explain that production Cloudflare Email requires Email Routing to invoke an email handler and R2/signed URLs for attachments.',
  tools: makeEmailTools(env),
}));
