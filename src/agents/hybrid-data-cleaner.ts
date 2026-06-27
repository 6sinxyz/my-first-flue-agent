import { defineAgent } from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';
import { getSandbox } from '@cloudflare/sandbox';
import { makeHybridDataTools } from '../lib/demos/hybrid-data-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Hybrid data-cleaner demo: lightweight Worker inspect/validate/anomaly checks and pandas container transforms only when needed.';

export default defineAgent(({ id, env }: { id: string; env: any }) => {
  const hasSandbox = Boolean(env?.Sandbox);
  return {
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions:
      'You are a hybrid data-cleaning demo. Prefer lightweight_inspect, lightweight_validate, and lightweight_anomalies for read-only checks. Use run_pandas only for transformations that need pandas. Use benchmark_inspect when asked to compare against current inspect_data.',
    tools: makeHybridDataTools(env, id),
    ...(hasSandbox ? { sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)) } : {}),
  };
});
