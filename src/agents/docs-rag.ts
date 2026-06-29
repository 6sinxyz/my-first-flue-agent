import { defineAgent } from '@flue/runtime';
import { makeDocsTools } from '../lib/demos/docs-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Small docs/search/RAG demo with persistent ingest and explicit citations.';

export default defineAgent(({ id, env }: { id: string; env: any }) => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
  thinkingLevel: 'off',
  instructions:
    'Use docs tools immediately and answer concisely. If source text is provided, call ingest_doc first. For questions, call search_docs before answering. Include citation ids/URLs. Mention persistence only when relevant.',
  tools: makeDocsTools(env, id),
}));
