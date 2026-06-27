/**
 * calculator agent — demonstrates defineTool (valibot input/output, run).
 * Tools: add / subtract / multiply. The model auto-selects and invokes them.
 *
 * `calcConfig` is shared with the router agent, which wraps it in a
 * defineAgentProfile so the same calculator is available as a subagent.
 */
import { defineAgent, defineTool } from '@flue/runtime';
import * as v from 'valibot';

export const route = async (_c: any, next: any) => next();

const add = defineTool({
  name: 'add',
  description: 'Add two numbers (a + b) and return the sum.',
  input: v.object({ a: v.number(), b: v.number() }),
  output: v.object({ sum: v.number() }),
  run: ({ input }) => ({ sum: input.a + input.b }),
});
const subtract = defineTool({
  name: 'subtract',
  description: 'Subtract b from a (a - b) and return the difference.',
  input: v.object({ a: v.number(), b: v.number() }),
  output: v.object({ difference: v.number() }),
  run: ({ input }) => ({ difference: input.a - input.b }),
});
const multiply = defineTool({
  name: 'multiply',
  description: 'Multiply two numbers (a * b) and return the product.',
  input: v.object({ a: v.number(), b: v.number() }),
  output: v.object({ product: v.number() }),
  run: ({ input }) => ({ product: input.a * input.b }),
});

export const calcConfig = {
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a calculator agent. ALWAYS use the provided tools (add, subtract, multiply) to compute answers — never compute results yourself. Break expressions like 12*7+3 into tool calls. After getting tool results, state the final answer briefly.',
  tools: [add, subtract, multiply],
};

export default defineAgent(() => calcConfig);
