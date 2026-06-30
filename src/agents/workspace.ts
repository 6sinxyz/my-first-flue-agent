import { defineAgent } from '@flue/runtime';
import { makeWorkspaceTools } from '../lib/demos/workspace-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Durable workspace/filesystem demo with write, read, list, workspace_grep, diff, and reset tools persisted by agent id.';

export default defineAgent(({ id, env }: { id: string; env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'Use workspace tools immediately and answer concisely. For reset/write/read requests, call reset_workspace first, then write_file, then read_file exactly once each. Do not read before writing. Mention persistence only when relevant.',
  tools: makeWorkspaceTools(env, id),
}));
