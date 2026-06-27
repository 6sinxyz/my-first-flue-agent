/**
 * Container-backed Python runner (Phase 2).
 *
 * Uses @cloudflare/sandbox: getSandbox(env.Sandbox, id) returns a sandbox stub
 * backed by an isolated container (image: registry.cloudflare.com/.../
 * my-first-flue-agent-sandbox:v1 — Alpine + node/bun + cloudflared + python3
 * + pandas 3.0.3 + numpy 2.4.4). The agent reaches it via sandbox.exec() /
 * readFile() / writeFile() — same contract as the local HTTP runner.
 *
 * Data staging: the container FS is isolated, so a local data_ref path is
 * meaningless in prod. runPandas/runPythonJson accept a data_ref that is either
 * an http(s) URL (fetched + written into the container) or an already-staged
 * container path (returned from a prior call). stageInput() handles the fetch.
 */
import { getSandbox } from '@cloudflare/sandbox';
import { readCsv as localReadCsv, saveResult as localSaveResult, RUNNER_URL } from './python-runner.js';

export interface ContainerRunnerEnv {
  Sandbox: any;
}

let sandboxCache: { id: string; stub: any } | null = null;

function getStub(env: ContainerRunnerEnv, id: string) {
  if (sandboxCache && sandboxCache.id === id) return sandboxCache.stub;
  const stub = getSandbox(env.Sandbox, id);
  sandboxCache = { id, stub };
  return stub;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Resolve a data_ref to a container-local path. http(s):// URLs are fetched
 * and written into /workspace; bare /workspace or /tmp paths are assumed
 * already container-local (e.g. a result_ref from a prior run_pandas).
 */
async function stageInput(env: ContainerRunnerEnv, sessionId: string, dataRef: string): Promise<string> {
  if (dataRef.startsWith('/workspace/') || dataRef.startsWith('/tmp/')) return dataRef;
  if (/^https?:\/\//i.test(dataRef)) {
    const stub = getStub(env, sessionId);
    const resp = await fetch(dataRef);
    if (!resp.ok) throw new Error('stageInput fetch failed: ' + resp.status + ' ' + dataRef);
    const content = await resp.text();
    const path = '/workspace/input-' + uid() + '.csv';
    await stub.writeFile(path, content);
    return path;
  }
  throw new Error('container backend cannot read local path "' + dataRef + '" — pass an http(s) URL or R2 object URL.');
}

/** Run a pandas snippet in the container. INPUT_PATH/RESULT_PATH are set. */
export async function runPandasContainer(
  env: ContainerRunnerEnv,
  sessionId: string,
  code: string,
  inputPath: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; resultPath?: string }> {
  const stub = getStub(env, sessionId);
  const stagedInput = await stageInput(env, sessionId, inputPath);
  const scriptPath = '/workspace/dc-' + uid() + '.py';
  const resultPath = '/workspace/result-' + uid() + '.csv';
  const wrapped = 'import os\nos.environ["INPUT_PATH"] = ' + JSON.stringify(stagedInput) + '\nos.environ["RESULT_PATH"] = ' + JSON.stringify(resultPath) + '\nos.environ["OUTPUT_PATH"] = os.environ["RESULT_PATH"]\n' + code;
  await stub.writeFile(scriptPath, wrapped);
  const r: any = await stub.exec('python ' + scriptPath, { timeout: opts.timeoutMs ?? 30_000 });
  const ok = r.success ?? ((r.exitCode ?? 0) === 0);
  let resultPathOut: string | undefined;
  if (ok) {
    try { await stub.readFile(resultPath); resultPathOut = resultPath; } catch { resultPathOut = undefined; }
  }
  return { ok, stdout: (r.stdout ?? '').slice(-4000), stderr: (r.stderr ?? '').slice(-4000), exitCode: r.exitCode ?? (ok ? 0 : 1), resultPath: resultPathOut };
}

/** Run python that prints JSON; returns parsed json. dataRef (if any) is staged. */
export async function runPythonJsonContainer<T = unknown>(
  env: ContainerRunnerEnv,
  sessionId: string,
  code: string,
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; json?: T; stdout: string; stderr: string; exitCode: number }> {
  const stub = getStub(env, sessionId);
  const scriptPath = '/workspace/dc-' + uid() + '.py';
  const envVars: Record<string, string> = { ...opts.env };
  if (envVars.INPUT_PATH && /^https?:\/\//i.test(envVars.INPUT_PATH)) {
    envVars.INPUT_PATH = await stageInput(env, sessionId, envVars.INPUT_PATH);
  }
  const envLines = Object.entries(envVars).map(([k, v]) => 'os.environ[' + JSON.stringify(k) + '] = ' + JSON.stringify(v)).join('\n');
  const wrapped = 'import os\n' + envLines + '\n' + code;
  await stub.writeFile(scriptPath, wrapped);
  const r: any = await stub.exec('python ' + scriptPath, { timeout: opts.timeoutMs ?? 30_000 });
  const ok = r.success;
  const stdout = r.stdout ?? '';
  const json = ok && stdout.trim() ? safeJson<T>(stdout) : undefined;
  return { ok, json, stdout, stderr: r.stderr ?? '', exitCode: r.exitCode ?? (ok ? 0 : 1) };
}

/** Read a file from the container FS as text (for previews). */
export async function readCsvContainer(env: ContainerRunnerEnv, sessionId: string, path: string): Promise<string> {
  const stub = getStub(env, sessionId);
  const file: any = await stub.readFile(path);
  return typeof file === 'string' ? file : (file?.content ?? String(file));
}

/** Copy a staged result CSV to a durable output path inside the container. */
export async function saveResultContainer(env: ContainerRunnerEnv, sessionId: string, src: string, dest: string): Promise<void> {
  const stub = getStub(env, sessionId);
  const content = await readCsvContainer(env, sessionId, src);
  const dir = dest.replace(/\/[^/]+$/, '');
  if (dir && dir !== dest) await stub.exec('mkdir -p ' + dir).catch(() => {});
  await stub.writeFile(dest, content);
}

function sanitizeJsonText(value: string) {
  // Python json.dumps can emit NaN/Infinity tokens; JSON.parse rejects them,
  // and Flue rejects non-JSON tool outputs. Convert them to null before parse.
  return value
    .replace(/-?Infinity/g, 'null')
    .replace(/NaN/g, 'null');
}

function tryParseJson<T>(value: string): T | undefined {
  const text = sanitizeJsonText(value.trim());
  if (!text) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
}

function extractJsonObjectText(value: string): string | undefined {
  const text = value.trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return undefined;
  return text.slice(first, last + 1);
}

function safeJson<T>(s: string): T | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const whole = tryParseJson<T>(t);
  if (whole !== undefined) return whole;
  const last = t.split(String.fromCharCode(10)).filter(Boolean).pop();
  if (last) {
    const parsedLast = tryParseJson<T>(last);
    if (parsedLast !== undefined) return parsedLast;
  }
  const embedded = extractJsonObjectText(t);
  return embedded ? tryParseJson<T>(embedded) : undefined;
}

export { localReadCsv, localSaveResult, RUNNER_URL };
