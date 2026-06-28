/**
 * Container-backed Python runner (Phase 2).
 *
 * Uses @cloudflare/sandbox: getSandbox(env.Sandbox, id) returns a sandbox stub
 * backed by an isolated container. The container FS is isolated, so prod inputs
 * must be URL/R2-like refs, not local host paths. http(s) refs are fetched and
 * staged into /workspace before pandas runs.
 */
import { getSandbox } from '@cloudflare/sandbox';
import { readCsv as localReadCsv, saveResult as localSaveResult, RUNNER_URL } from './python-runner.js';

export interface ContainerRunnerEnv {
  Sandbox: any;
  [binding: string]: any;
}

let sandboxCache: { id: string; stub: any } | null = null;

function getStub(env: ContainerRunnerEnv, id: string) {
  if (sandboxCache && sandboxCache.id === id) return sandboxCache.stub;
  const stub = getSandbox(env.Sandbox, id);
  sandboxCache = { id, stub };
  return stub;
}

let uidCounter = 0;

function uid() {
  uidCounter = (uidCounter + 1) % Number.MAX_SAFE_INTEGER;
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${Date.now().toString(36)}-${uidCounter.toString(36)}-${random}`;
  }
  return `${Date.now().toString(36)}-${uidCounter.toString(36)}`;
}

function execSucceeded(r: any) {
  if (typeof r?.success === 'boolean') return r.success;
  if (typeof r?.exitCode === 'number') return r.exitCode === 0;
  if (typeof r?.code === 'number') return r.code === 0;
  // @cloudflare/sandbox 0.9.x can omit success/exitCode for successful execs.
  return !r?.stderr;
}

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
  if (dataRef.startsWith('r2://')) {
    const [bucketName, ...keyParts] = dataRef.replace('r2://', '').split('/');
    const key = keyParts.join('/');
    const bucket = env?.[bucketName];
    if (!bucket?.get || !key) throw new Error('R2 binding/key unavailable for ' + dataRef);
    const object = await bucket.get(key);
    if (!object) throw new Error('R2 object not found: ' + dataRef);
    const content = await object.text();
    const stub = getStub(env, sessionId);
    const path = '/workspace/input-' + uid() + '.csv';
    await stub.writeFile(path, content);
    return path;
  }
  throw new Error('container backend cannot read local path "' + dataRef + '" — pass an http(s) URL, r2://BINDING/key.csv, or a staged /workspace path.');
}

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
  const ok = execSucceeded(r);
  let resultPathOut: string | undefined;
  if (ok) {
    try { await stub.readFile(resultPath); resultPathOut = resultPath; } catch { resultPathOut = undefined; }
  }
  return {
    ok,
    stdout: (r.stdout ?? '').slice(-4000),
    stderr: (r.stderr ?? '').slice(-4000),
    exitCode: r.exitCode ?? r.code ?? (ok ? 0 : 1),
    resultPath: resultPathOut,
  };
}

export async function runPythonJsonContainer<T = unknown>(
  env: ContainerRunnerEnv,
  sessionId: string,
  code: string,
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; json?: T; stdout: string; stderr: string; exitCode: number }> {
  const stub = getStub(env, sessionId);
  const scriptPath = '/workspace/dc-' + uid() + '.py';
  const envVars: Record<string, string> = { ...opts.env };
  if (envVars.INPUT_PATH && (/^https?:\/\//i.test(envVars.INPUT_PATH) || envVars.INPUT_PATH.startsWith('r2://'))) {
    envVars.INPUT_PATH = await stageInput(env, sessionId, envVars.INPUT_PATH);
  }
  const envLines = Object.entries(envVars).map(([k, v]) => 'os.environ[' + JSON.stringify(k) + '] = ' + JSON.stringify(v)).join('\n');
  const wrapped = 'import os\n' + envLines + '\n' + code;
  await stub.writeFile(scriptPath, wrapped);
  const r: any = await stub.exec('python ' + scriptPath, { timeout: opts.timeoutMs ?? 30_000 });
  const ok = execSucceeded(r);
  const stdout = r.stdout ?? '';
  const json = stdout.trim() ? safeJson<T>(stdout) : undefined;
  return {
    ok,
    json,
    stdout,
    stderr: r.stderr ?? '',
    exitCode: r.exitCode ?? r.code ?? (ok ? 0 : 1),
  };
}

export async function readCsvContainer(env: ContainerRunnerEnv, sessionId: string, path: string): Promise<string> {
  const stub = getStub(env, sessionId);
  const file: any = await stub.readFile(path);
  return typeof file === 'string' ? file : (file?.content ?? String(file));
}

export async function saveResultContainer(env: ContainerRunnerEnv, sessionId: string, src: string, dest: string): Promise<void> {
  const stub = getStub(env, sessionId);
  const content = await readCsvContainer(env, sessionId, src);
  const dir = dest.replace(/\/[^/]+$/, '');
  if (dir && dir !== dest) await stub.exec('mkdir -p ' + dir).catch(() => {});
  await stub.writeFile(dest, content);
}

function sanitizeJsonText(value: string) {
  return value
    .replace(/-?\bInfinity\b/g, 'null')
    .replace(/\bNaN\b/g, 'null');
}

function tryParseJson<T>(value: string): T | undefined {
  const text = sanitizeJsonText(value.trim());
  if (!text) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
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
  const first = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (first !== -1 && lastBrace > first) return tryParseJson<T>(t.slice(first, lastBrace + 1));
  return undefined;
}

export { localReadCsv, localSaveResult, RUNNER_URL };
