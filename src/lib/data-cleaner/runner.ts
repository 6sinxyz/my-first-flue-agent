/**
 * Backend selector for the data-cleaner Python runner.
 *
 * If the Worker has a Sandbox binding (env.Sandbox), use the container backend
 * (@cloudflare/sandbox, real isolated container with python3+pandas). Otherwise
 * fall back to the local HTTP runner (scripts/pyrunner.py) for `flue run` dev.
 * Tools call createRunner(env, id) once and get a uniform interface.
 */
import * as local from './python-runner.js';
import * as container from './container-runner.js';

export interface PythonRunner {
  runPandasSnippet(code: string, inputPath: string, opts?: { timeoutMs?: number }): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; resultPath?: string | null }>;
  runPythonJson<T = unknown>(code: string, opts?: { timeoutMs?: number; env?: Record<string, string> }): Promise<{ ok: boolean; json?: T; stdout: string; stderr: string; exitCode: number }>;
  readCsv(path: string): Promise<string>;
  saveResult(src: string, dest: string): Promise<void>;
}

export function createRunner(env: any, sessionId: string): PythonRunner {
  if (env?.Sandbox) {
    const e = env as container.ContainerRunnerEnv;
    return {
      runPandasSnippet: (code, inputPath, opts) => container.runPandasContainer(e, sessionId, code, inputPath, opts),
      runPythonJson: <T = unknown>(code: string, opts?: any) => container.runPythonJsonContainer<T>(e, sessionId, code, opts),
      readCsv: (path) => container.readCsvContainer(e, sessionId, path),
      saveResult: (src, dest) => container.saveResultContainer(e, sessionId, src, dest),
    };
  }
  // local HTTP runner (dev)
  return {
    runPandasSnippet: local.runPandasSnippet,
    runPythonJson: local.runPythonJson,
    readCsv: local.readCsv,
    saveResult: local.saveResult,
  };
}
