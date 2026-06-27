/**
 * Pluggable Python execution backend for the data-cleaner agent.
 *
 * Phase 1: a tiny local HTTP service (`scripts/pyrunner.py`) runs `python3`
 * with pandas. The flue agent calls it over fetch. This keeps the agent
 * runnable under `flue run --target cloudflare` (model via env.AI remote)
 * while real pandas runs on the host. The interface is backend-agnostic:
 * Phase 2 swaps runPythonHttp() for a `cloudflareSandbox(getSandbox(env.Sandbox, id))`
 * backend without touching tools or the agent.
 */
export const RUNNER_URL = process.env.DC_PYTHON_URL ?? 'http://127.0.0.1:8790';

export interface PythonRunRequest {
  code: string;
  /** env vars exposed to the python process (e.g. INPUT_PATH, RESULT_PATH). */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface PythonRunResponse {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** absolute path the snippet wrote its result to (RESULT_PATH), if any */
  resultPath?: string;
}

async function runPythonHttp(req: PythonRunRequest): Promise<PythonRunResponse> {
  const res = await fetch(`${RUNNER_URL}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`python-runner HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return (await res.json()) as PythonRunResponse;
}

/** Run a pandas snippet; RESULT_PATH env is set so the snippet writes the cleaned CSV there. */
export async function runPandasSnippet(
  code: string,
  inputPath: string,
  opts: { timeoutMs?: number } = {},
): Promise<PythonRunResponse> {
  return runPythonHttp({
    code,
    env: { INPUT_PATH: inputPath },
    timeoutMs: opts.timeoutMs ?? 30_000,
  });
}

/** Run python that prints JSON to stdout; returns parsed json. */
export async function runPythonJson<T = unknown>(
  code: string,
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<{ ok: boolean; json?: T; stdout: string; stderr: string; exitCode: number }> {
  const r = await runPythonHttp({ code, env: opts.env, timeoutMs: opts.timeoutMs ?? 30_000 });
  const json = r.ok && r.stdout.trim() ? safeJson<T>(r.stdout) : undefined;
  return { ok: r.ok, json, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}

function safeJson<T>(s: string): T | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed) as T; } catch {
    const last = trimmed.split('\n').filter(Boolean).pop();
    if (last) try { return JSON.parse(last) as T; } catch { /* ignore */ }
    return undefined;
  }
}

/** Fetch a file's text content from the runner (so the worker doesn't need FS access). */
export async function readCsv(path: string): Promise<string> {
  const res = await fetch(`${RUNNER_URL}/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`readCsv ${res.status}`);
  return res.text();
}

/** Copy a staged result CSV to a durable output path on the runner host. */
export async function saveResult(srcPath: string, destPath: string): Promise<void> {
  const res = await fetch(`${RUNNER_URL}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ src: srcPath, dest: destPath }),
  });
  if (!res.ok) throw new Error(`saveResult ${res.status}`);
}
