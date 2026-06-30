import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { deleteJsonStore, readJsonStore, writeJsonStore } from './json-store.js';

interface DocRecord {
  id: string;
  title: string;
  url: string;
  text: string;
}

const builtInDocs: DocRecord[] = [
  {
    id: 'flue-routing',
    title: 'Flue routing',
    url: 'node_modules/@flue/runtime/docs/guide/routing.md',
    text: 'Export route from an agent or workflow module to expose HTTP routes. Mount flue() from @flue/runtime/routing in src/app.ts when custom application routes or auth are needed.',
  },
  {
    id: 'flue-workflows',
    title: 'Flue workflows',
    url: 'node_modules/@flue/runtime/docs/guide/workflows.md',
    text: 'Workflows are finite inspectable operations. Export route to invoke over HTTP and runs to inspect run metadata and durable event streams.',
  },
  {
    id: 'flue-sdk-agents',
    title: 'Flue SDK agents',
    url: 'node_modules/@flue/runtime/docs/sdk/agents.md',
    text: 'client.agents.prompt waits for a result with POST /agents/:name/:id?wait=result. client.agents.send starts work and returns a stream offset for client.agents.stream.',
  },
  {
    id: 'cloudflare-email',
    title: 'Cloudflare Email Workers',
    url: 'https://developers.cloudflare.com/email-routing/email-workers/',
    text: 'Cloudflare Email Routing can invoke a Worker email() handler with message metadata and raw MIME content. This repo includes a live email() handler that stores raw MIME/metadata in DATA_R2 after a domain route is configured, plus test-mode email payload tools.',
  },
];

function scoreDoc(doc: DocRecord, terms: string[]) {
  const haystack = `${doc.title}\n${doc.url}\n${doc.text}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export function makeDocsTools(env: any, agentId: string) {
  const readCorpus = () => readJsonStore<DocRecord[]>(env, 'docs-rag', agentId, 'docs', []);
  const writeCorpus = (docs: DocRecord[]) => writeJsonStore(env, 'docs-rag', agentId, 'docs', docs);
  const storeMode = () => env?.DEMO_JSON_STORE ? 'DemoJsonStore' : 'memory-dev';

  const ingestDoc = defineTool({
    name: 'ingest_doc',
    description: 'Persist a document into this agent id docs corpus for later search. The returned store_mode reports whether storage is Durable Object backed or memory-dev fallback.',
    input: v.object({ id: v.string(), title: v.string(), url: v.string(), text: v.string() }),
    run: async ({ input }) => {
      const docs = await readCorpus();
      const next = docs.filter((doc) => doc.id !== input.id);
      next.push({ id: input.id, title: input.title, url: input.url, text: input.text });
      await writeCorpus(next);
      return { stored: true, id: input.id, corpus_size: next.length, store_mode: storeMode() };
    },
  });

  const listDocs = defineTool({
    name: 'list_docs',
    description: 'List built-in and ingested document ids available to search.',
    run: async () => {
      const ingested = await readCorpus();
      return {
        built_in: builtInDocs.map(({ id, title, url }) => ({ id, title, url })),
        ingested: ingested.map(({ id, title, url }) => ({ id, title, url })),
      };
    },
  });

  const searchDocs = defineTool({
    name: 'search_docs',
    description: 'Search built-in plus persisted docs corpus and return cited passages.',
    input: v.object({ query: v.string(), limit: v.optional(v.number()) }),
    run: async ({ input }) => {
      const terms = input.query.toLowerCase().split(/\W+/).filter(Boolean);
      const ingested = await readCorpus();
      const corpus = [...builtInDocs, ...ingested];
      const matches = corpus
        .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit ?? 4);
      return {
        answer: matches.map(({ doc }) => `${doc.title}: ${doc.text}`).join('\n'),
        citations: matches.map(({ doc }) => ({ id: doc.id, title: doc.title, url: doc.url })),
        corpus: { built_in: builtInDocs.length, ingested: ingested.length, store_mode: storeMode() },
      };
    },
  });

  const resetDocs = defineTool({
    name: 'reset_docs',
    description: 'Clear documents ingested for this agent id. Built-in docs remain available.',
    run: async () => {
      await deleteJsonStore(env, 'docs-rag', agentId, 'docs');
      return { reset: true };
    },
  });

  return [ingestDoc, listDocs, searchDocs, resetDocs];
}
