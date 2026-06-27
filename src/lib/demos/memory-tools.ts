import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { deleteJsonStore, readJsonStore, writeJsonStore } from './json-store.js';

interface MemoryState {
  notes: string[];
  dispatches: Array<{ target: string; reason: string; at: string }>;
}

export function makeMemoryTools(env: any, agentId: string) {
  const read = () => readJsonStore<MemoryState>(env, 'dispatcher-memory', agentId, 'memory', { notes: [], dispatches: [] });
  const write = (state: MemoryState) => writeJsonStore(env, 'dispatcher-memory', agentId, 'memory', state);

  const remember = defineTool({
    name: 'remember',
    description: 'Store a memory note for this dispatcher agent id.',
    input: v.object({ note: v.string() }),
    run: async ({ input }) => {
      const state = await read();
      state.notes.push(input.note);
      await write(state);
      return state as unknown as JsonValue;
    },
  });

  const recall = defineTool({
    name: 'recall_memory',
    description: 'Read memory notes and dispatch history for this stable dispatcher agent id.',
    run: async () => (await read()) as unknown as JsonValue,
  });

  const recordDispatch = defineTool({
    name: 'record_dispatch',
    description: 'Record which specialized agent should handle a request. The caller should then tell the user which agent to invoke, or use Flue subagent delegation when available.',
    input: v.object({ target: v.picklist(['calculator', 'code-mode', 'hybrid-data-cleaner', 'workspace', 'docs-rag', 'web-extractor', 'email-processor']), reason: v.string() }),
    run: async ({ input }) => {
      const state = await read();
      state.dispatches.push({ target: input.target, reason: input.reason, at: new Date().toISOString() });
      await write(state);
      return state as unknown as JsonValue;
    },
  });

  const reset = defineTool({
    name: 'reset_memory',
    description: 'Clear dispatcher memory for this agent id.',
    run: async () => {
      await deleteJsonStore(env, 'dispatcher-memory', agentId, 'memory');
      return { ok: true };
    },
  });

  return [remember, recall, recordDispatch, reset];
}
