import { defineAgent } from '@flue/runtime';
import { makeEmailTools } from '../lib/demos/email-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Test-mode email payload and CSV link processing demo with cleaning summaries and Cloudflare Email setup notes.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'Immediately call process_email_payload for test email payloads. Then concisely list CSV links/attachments, cleaning jobs, export paths, and data-cleaner handoff prompts. Keep Cloudflare Email setup notes brief.',
  tools: makeEmailTools(env),
}));
