import { defineAgent } from '@flue/runtime';
import { makeEmailTools } from '../lib/demos/email-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Test-mode email payload and CSV link processing demo with cleaning summaries and Cloudflare Email setup notes.';

export default defineAgent(({ env }: { env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'For test email payloads, immediately call process_email_payload. For live routed email, use list_stored_emails and read_stored_email to inspect DATA_R2 records stored by the Worker email() handler. Answer concisely with CSV links/attachments, jobs, export paths, and handoff prompts.',
  tools: makeEmailTools(env),
}));
