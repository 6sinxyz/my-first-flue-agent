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
    thinkingLevel: 'off',
    instructions:
      'Use lightweight tools immediately. For inspect/profile requests call lightweight_inspect only. For validation call lightweight_validate. For anomaly checks call lightweight_anomalies. Use benchmark_inspect only when asked to compare. Answer concisely.',
    tools: makeHybridDataTools(env, id),
    ...(hasSandbox ? { sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)) } : {}),
  };
});
