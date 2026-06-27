import { defineAgent, defineWorkflow } from '@flue/runtime';
import * as v from 'valibot';

export const route = async (_c: any, next: any) => next();
export const runs = async (_c: any, next: any) => next();

export default defineWorkflow({
  agent: defineAgent(() => ({ model: false })),
  input: v.object({
    items: v.array(v.string()),
    label: v.optional(v.string()),
  }),
  output: v.object({
    label: v.string(),
    count: v.number(),
    checksum: v.string(),
    normalized: v.array(v.string()),
    limitation: v.string(),
  }),
  async run({ input }) {
    const normalized = input.items.map((item) => item.trim().toLowerCase()).filter(Boolean).sort();
    const bytes = new TextEncoder().encode(normalized.join('\n'));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const checksum = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      label: input.label ?? 'repeatable-report',
      count: normalized.length,
      checksum,
      normalized,
      limitation:
        '@cloudflare/dynamic-workflows is not exposed by the installed Flue/Cloudflare runtime. This demo uses Flue defineWorkflow with durable run records and event streams.',
    };
  },
});
