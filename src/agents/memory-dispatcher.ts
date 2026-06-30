import { defineAgent, defineAgentProfile } from '@flue/runtime';
import { calcConfig } from './calculator.js';
import { makeCodeModeTools } from '../lib/demos/code-tools.js';
import { makeDocsTools } from '../lib/demos/docs-tools.js';
import { makeEmailTools } from '../lib/demos/email-tools.js';
import { makeHybridDataTools } from '../lib/demos/hybrid-data-tools.js';
import { makeMemoryTools } from '../lib/demos/memory-tools.js';
import { makeWebTools } from '../lib/demos/web-tools.js';
import { makeWorkspaceTools } from '../lib/demos/workspace-tools.js';

export const route = async (_c: any, next: any) => next();
export const description = 'Memory-enabled dispatcher over calculator, hybrid data cleaner, workspace, docs, web, code, and email demos with stable-id memory and reset tools.';

export default defineAgent(({ id, env }: { id: string; env: any }) => {
  const calculatorSubagent = defineAgentProfile({ name: 'calculator', ...calcConfig });
  const codeModeSubagent = defineAgentProfile({
    name: 'code-mode',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Arithmetic evaluator subagent. Use run_short_js for short deterministic arithmetic expressions and be clear that it is not a general JavaScript runtime.',
    tools: makeCodeModeTools(),
  });
  const dataCleanerSubagent = defineAgentProfile({
    name: 'hybrid-data-cleaner',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Hybrid data cleaner subagent. Use lightweight inspect/validate/anomaly tools immediately; use pandas only for transforms. Be concise.',
    tools: makeHybridDataTools(env, id),
  });
  const docsSubagent = defineAgentProfile({
    name: 'docs-rag',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Docs RAG subagent. Use ingest_doc for source text and search_docs before answers. Be concise with citations.',
    tools: makeDocsTools(env, id),
  });
  const emailSubagent = defineAgentProfile({
    name: 'email-processor',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Email processor subagent. For test payloads call process_email_payload; for live routed mail use list_stored_emails/read_stored_email. Return concise links/attachments, jobs, export paths, and handoff prompts.',
    tools: makeEmailTools(env),
  });
  const workspaceSubagent = defineAgentProfile({
    name: 'workspace',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Workspace subagent. For reset/write/read, call reset_workspace, write_file, read_file exactly once in that order. Do not read before writing. Be concise.',
    tools: makeWorkspaceTools(env, id),
  });
  const webSubagent = defineAgentProfile({
    name: 'web-extractor',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions: 'Web extraction subagent. Immediately call extract_url; summarize title/text/links and backend used. Be concise.',
    tools: makeWebTools(env),
  });

  return {
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    thinkingLevel: 'off',
    instructions:
      'Memory dispatcher. Call recall_memory first. If the user states a durable preference, call remember. Pick exactly one target, call record_dispatch, then delegate with task. Return a concise result. Mention memory persistence only when relevant.',
    tools: makeMemoryTools(env, id),
    subagents: [
      calculatorSubagent,
      codeModeSubagent,
      dataCleanerSubagent,
      docsSubagent,
      emailSubagent,
      workspaceSubagent,
      webSubagent,
    ],
  };
});
