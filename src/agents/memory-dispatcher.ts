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
    instructions: 'Code Mode demo subagent. Use run_short_js for short deterministic arithmetic snippets and explain current Dynamic Worker limitations.',
    tools: makeCodeModeTools(),
  });
  const dataCleanerSubagent = defineAgentProfile({
    name: 'hybrid-data-cleaner',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: 'Hybrid data cleaner subagent. Prefer lightweight inspect/validate/anomaly tools and use pandas tools only for transforms.',
    tools: makeHybridDataTools(env, id),
  });
  const docsSubagent = defineAgentProfile({
    name: 'docs-rag',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: 'Docs RAG subagent. Use ingest_doc for new source text and search_docs before answering with citations.',
    tools: makeDocsTools(env, id),
  });
  const emailSubagent = defineAgentProfile({
    name: 'email-processor',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: 'Email processor subagent. Use process_email_payload to extract CSV links/attachments, produce cleaning summaries, suggested export paths, and handoff prompts.',
    tools: makeEmailTools(env),
  });
  const workspaceSubagent = defineAgentProfile({
    name: 'workspace',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: 'Workspace subagent. Use workspace tools for write, read, list, grep, diff, and reset operations. Files persist for the stable agent id.',
    tools: makeWorkspaceTools(env, id),
  });
  const webSubagent = defineAgentProfile({
    name: 'web-extractor',
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: 'Web extraction subagent. Use fetch_extract to retrieve and summarize page title/text/links with citations.',
    tools: makeWebTools(env),
  });

  return {
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions:
      'You are a memory-enabled dispatcher. First call recall_memory. Use remember when the user states a durable preference. Use record_dispatch when choosing calculator, code-mode, hybrid-data-cleaner, workspace, docs-rag, web-extractor, or email-processor. Delegate via the task tool to the matching subagent and return a concise result. Tell users memory is keyed by this stable agent id and can be cleared with reset_memory.',
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
