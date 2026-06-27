/**
 * Container-backed Python runner (Phase 2).
 *
 * Uses @cloudflare/sandbox: getSandbox(env.Sandbox, id) returns a sandbox stub
 * backed by an isolated container (image built from sandbox/Dockerfile, which
 * extends the bundled sandbox runtime with python3 + pandas + numpy). The agent
 * reaches it via sandbox.exec() / readFile() / writeFile() — same contract as
 * the local HTTP runner (python-runner.ts), so tools are unchanged.
 *
 * Backend selection lives in python-runner.ts: if env.Sandbox is present, the
 * container runner is used; otherwise the local HTTP runner is the dev fallback.
 */
import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import { readCsv as localReadCsv, saveResult as localSaveResult, RUNNER_URL } from './python-runner.js';

export interface ContainerRunnerEnv {
  // DurableObjectNamespace<Sandbox>; typed loosely to avoid workers-types coupling.
  Sandbox: any;
}

let sandboxCache: { id: string; stub: ReturnType<typeof getSandbox> } | null = null;

function getStub(env: ContainerRunnerEnv, id: string) {
  // Reuse a per-process sandbox for the same id; getSandbox() is itself cached
  // inside the SDK, but we avoid repeated RPC resolution.
  if (sandboxCache && sandboxCache.id === id) return sandboxCache.stub;
  const stub = getSandbox(env.Sandbox, id);
  sandboxCache = { id, stub };
  return stub;
}

/** Run a python snippet in the container. INPUT_PATH/RESULT_PATH are env vars. */
export async function runPandasContainer(
  env: ContainerRunnerEnv,
  sessionId: string,
  code: string,
  inputPath: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; resultPath: string | null }> {
  const stub = getStub(env, sessionId);
  // Stage the script + result inside the container workspace.
  const scriptPath = `/workspace/dc-${Date.now()}.py`;
  const resultPath = `/workspace/dc-${Date.now()}.csv`;
  const wrapped = `import os
os.environ['INPUT_PATH'] = ${JSON.stringify(inputPath)}
os.environ['RESULT_PATH'] = ${JSON.stringify(resultPath)}
os.environ['OUTPUT_PATH'] = os.environ['RESULT_PATH']
${code}`;
  await stub.writeFile(scriptPath, wrapped);
  // Execute. exec() returns { stdout, stderr, success, exitCode }.
  const r = await stub.exec(`python ${scriptPath}`, { timeout: opts.timeoutMs ?? 30_000 });
  const ok = r.success;
  let resultPathOut: string | null = null;
  if (ok) {
    // Confirm the result file exists.
    try {
      await stub.readFile(resultPath);
      resultPathOut = resultPath;
    } catch {
      resultPathOut = null;
    }
  }
  return {
    ok,
    stdout: (r.stdout ?? '').slice(-4000),
    stderr: (r.stderr ?? '').slice(-4000),
    exitCode: (r as any).exitCode ?? (ok ? 0 : 1),
    resultPath: resultPathOut,
  };
}

/** Run python that prints JSON; returns parsed json. */
export async function runPythonJsonContainer<T = unknown>(
  env: ContainerRunnerEnv,
  sessionId: string,
  code: string,
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; json?: T; stdout: string; stderr: string; exitCode: number }> {
  const stub = getStub(env, sessionId);
  const scriptPath = `/workspace/dc-${Date.now()}.py`;
  const envLines = Object.entries(opts.env ?? {}).map(([k, v]) => `os.environ[${JSON.stringify(k)}] = ${JSON.stringify(v)}`).join('\n');
  const wrapped = `import os\n${envLines}\n${code}`;
  await stub.writeFile(scriptPath, wrapped);
  const r = await stub.exec(`python ${scriptPath}`, { timeout: opts.timeoutMs ?? 30_000 });
  const ok = r.success;
  const stdout = r.stdout ?? '';
  const json = ok && stdout.trim() ? safeJson<T>(stdout) : undefined;
  return { ok, json, stdout, stderr: r.stderr ?? '', exitCode: (r as any).exitCode ?? (ok ? 0 : 1) };
}

/** Read a file from the container FS as text (for previews). */
export async function readCsvContainer(env: ContainerRunnerEnv, sessionId: string, path: string): Promise<string> {
  const stub = getStub(env, sessionId);
  const file = await stub.readFile(path);
  // readFile may return { content } depending on encoding; normalize to string.
  const content = typeof file === 'string' ? file : (file as any)?.content ?? String(file);
  return content;
}

/** Copy a staged result CSV to a durable output path inside the container. */
export async function saveResultContainer(env: ContainerRunnerEnv, sessionId: string, src: string, dest: string): Promise<void> {
  const stub = getStub(env, sessionId);
  const content = await readCsvContainer(env, sessionId, src);
  // mkdir -p dest dir
  const dir = dest.replace(/\/[^/]+$/, '');
  await stub.exec(`mkdir -p ${dir}`).catch(() => {});
  await stub.writeFile(dest, content);
}

function safeJson<T>(s: string): T | undefined {
  const t = s.trim();
  if (!t) return undefined;
  try { return JSON.parse(t) as T; } catch {
    const last = t.split('\n').filter(Boolean).pop();
    if (last) try { return JSON.parse(last) as T; } catch { /* ignore */ }
    return undefined;
  }
}

// Re-export the local fallback so the backend selector has one import surface.
export { localReadCsv, localSaveResult, RUNNER_URL };
