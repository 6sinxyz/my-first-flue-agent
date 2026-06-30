/**
 * router (delegator) agent — demonstrates subagents.
 * Declares a `calculator` subagent (via defineAgentProfile wrapping the shared
 * calcConfig). Flue auto-exposes the framework `task` tool to this agent's
 * model, so it can delegate arithmetic to the calculator child and return its
 * final answer.
 */
import { defineAgent, defineAgentProfile } from '@flue/runtime';
import { calcConfig } from './calculator.js';

export const route = async (_c: any, next: any) => next();

const calculatorSubagent = defineAgentProfile({
  name: 'calculator',
  ...calcConfig,
});

export default defineAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'For arithmetic, immediately delegate to the calculator subagent via task. Return the final answer briefly.',
  subagents: [calculatorSubagent],
}));
