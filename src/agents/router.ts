/**
 * router (delegator) agent — demonstrates subagents.
 * Declares a `calculator` subagent (via defineAgentProfile wrapping the shared
 * calcConfig). Flue auto-exposes the framework `task` tool to this agent's
 * model, so it can delegate arithmetic to the calculator child and return its
 * final answer.
 */
import { defineAgent, defineAgentProfile } from '@flue/runtime';
import { calcConfig } from './calculator.js';

const calculatorSubagent = defineAgentProfile({
  name: 'calculator',
  ...calcConfig,
});

export default defineAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a router/delegator agent. You have no math tools yourself. For any arithmetic or computation request, delegate it to the `calculator` agent via the `task` tool, then return the final answer the calculator produced. Keep your own replies short.',
  subagents: [calculatorSubagent],
}));
