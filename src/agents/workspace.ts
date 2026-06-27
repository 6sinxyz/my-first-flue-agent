import { defineAgent } from '@flue/runtime';
import { makeWorkspaceTools } from '../lib/demos/workspace-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Durable workspace/filesystem demo with write, read, list, grep, diff, and reset tools persisted by agent id.';

export default defineAgent(({ id, env }: { id: string; env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a durable workspace agent. Use workspace tools for all file operations. State that files persist for the same agent id and can be cleared with reset_workspace.',
  tools: makeWorkspaceTools(env, id),
}));
