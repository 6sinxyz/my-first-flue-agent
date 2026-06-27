import { defineAgent } from '@flue/runtime';
import { makeDocsTools } from '../lib/demos/docs-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Small docs/search/RAG demo with persistent ingest and explicit citations.';

export default defineAgent(({ id, env }: { id: string; env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  instructions:
    'You are a docs RAG agent. Use ingest_doc when the user gives new source text to remember. Always call search_docs before answering knowledge questions. Include citation ids and URLs. Mention that ingested docs persist for the same agent id and reset_docs clears them.',
  tools: makeDocsTools(env, id),
}));
