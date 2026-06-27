import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { deleteJsonStore, readJsonStore, writeJsonStore } from './json-store.js';

type Workspace = Record<string, string>;

function normalizePath(path: string) {
  const clean = path.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) throw new Error('path must be a relative path without ".."');
  return clean;
}

function diffLines(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) out.push(` ${a[i] ?? ''}`);
    else {
      if (a[i] !== undefined) out.push(`-${a[i]}`);
      if (b[i] !== undefined) out.push(`+${b[i]}`);
    }
  }
  return out.join('\n');
}

export function makeWorkspaceTools(env: any, agentId: string) {
  const readWorkspace = () => readJsonStore<Workspace>(env, 'workspace', agentId, 'files', {});
  const writeWorkspace = (files: Workspace) => writeJsonStore(env, 'workspace', agentId, 'files', files);

  const writeFile = defineTool({
    name: 'write_file',
    description: 'Write text content to a relative workspace path. Persists for this same agent id.',
    input: v.object({ path: v.string(), content: v.string() }),
    run: async ({ input }) => {
      const path = normalizePath(input.path);
      const files = await readWorkspace();
      files[path] = input.content;
      await writeWorkspace(files);
      return { path, bytes: input.content.length, files: Object.keys(files).sort() };
    },
  });

  const readFile = defineTool({
    name: 'read_file',
    description: 'Read a relative workspace path from durable workspace storage.',
    input: v.object({ path: v.string() }),
    run: async ({ input }) => {
      const path = normalizePath(input.path);
      const files = await readWorkspace();
      if (!(path in files)) throw new Error(`workspace file not found: ${path}`);
      return { path, content: files[path] };
    },
  });

  const listFiles = defineTool({
    name: 'list_files',
    description: 'List durable workspace files for this agent id.',
    run: async () => ({ files: Object.keys(await readWorkspace()).sort() }),
  });

  const workspaceGrep = defineTool({
    name: 'workspace_grep',
    description: 'Search workspace files by substring or JavaScript regular expression.',
    input: v.object({ query: v.string(), regex: v.optional(v.boolean()) }),
    run: async ({ input }) => {
      const files = await readWorkspace();
      const re = input.regex ? new RegExp(input.query, 'i') : null;
      const matches: Array<{ path: string; line: number; text: string }> = [];
      for (const [path, content] of Object.entries(files)) {
        content.split('\n').forEach((line, index) => {
          if (re ? re.test(line) : line.toLowerCase().includes(input.query.toLowerCase())) {
            matches.push({ path, line: index + 1, text: line });
          }
        });
      }
      return { matches };
    },
  });

  const diffFile = defineTool({
    name: 'diff_file',
    description: 'Preview a simple line diff between an existing workspace file and proposed new content.',
    input: v.object({ path: v.string(), proposed_content: v.string() }),
    run: async ({ input }) => {
      const path = normalizePath(input.path);
      const files = await readWorkspace();
      return { path, diff: diffLines(files[path] ?? '', input.proposed_content) };
    },
  });

  const resetWorkspace = defineTool({
    name: 'reset_workspace',
    description: 'Clear all durable workspace files for this agent id.',
    run: async () => {
      await deleteJsonStore(env, 'workspace', agentId, 'files');
      return { ok: true };
    },
  });

  return [writeFile, readFile, listFiles, workspaceGrep, diffFile, resetWorkspace];
}
