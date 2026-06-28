/**
 * data-cleaner tools (Phase 1+2). Single-responsibility defineTool with valibot
 * input. Output schemas omitted (dynamic pandas payloads). Python execution
 * goes through a PythonRunner selected by createRunner(): container backend
 * (env.Sandbox) in prod, local HTTP runner in dev. Tools are built by
 * makeDataCleanerTools(env, sessionId) so each run closes over the right backend.
 */
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { createRunner, type PythonRunner } from './runner.js';


function safeOutputName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('output_name must not be empty');
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) throw new Error('output_name must be a simple file name, not a path');
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) throw new Error('output_name may contain only letters, numbers, dot, underscore, and dash');
  return trimmed.toLowerCase().endsWith('.csv') ? trimmed : `${trimmed}.csv`;
}

export function makeDataCleanerTools(env: any, sessionId: string) {
  const r: PythonRunner = createRunner(env, sessionId);

  const inspectData = defineTool({
    name: 'inspect_data',
    description: 'Load a CSV and return a profile: shape, dtypes, head, null counts, numeric stats. Read-only. Call this first.',
    input: v.object({ data_ref: v.string() }),
    run: async ({ input }) => {
      const code = [
        'import os, json, pandas as pd',
        'df = pd.read_csv(os.environ["INPUT_PATH"])',
        'stats = {}',
        'for c in df.select_dtypes("number").columns:',
        '    s = df[c]; stats[c] = {"min": float(s.min()), "max": float(s.max()), "mean": float(s.mean()), "median": float(s.median())}',
        'print(json.dumps({"rows": int(df.shape[0]), "cols": int(df.shape[1]), "dtypes": {c: str(t) for c,t in df.dtypes.items()}, "head": df.head(5).where(pd.notnull(df.head(5)), None).to_dict(orient="records"), "null_counts": {c: int(df[c].isna().sum()) for c in df.columns}, "numeric_stats": stats}))',
      ].join('\n');
      const res = await r.runPythonJson(code, { env: { INPUT_PATH: input.data_ref } });
      if (!res.ok || !res.json) throw new Error('inspect_data failed: ' + (res.stderr || res.stdout));
      return res.json as any;
    },
  });

  const runPandas = defineTool({
    name: 'run_pandas',
    description: 'Execute pandas code you wrote to clean the data. Input CSV is at env INPUT_PATH; you MUST write the cleaned dataframe to env RESULT_PATH via df.to_csv(os.environ["RESULT_PATH"], index=False). Returns ok/stdout/stderr and result_ref + preview. If it errors, read stderr, fix the code, call again.',
    input: v.object({ code: v.string(), data_ref: v.string() }),
    run: async ({ input }) => {
      const res = await r.runPandasSnippet(input.code, input.data_ref);
      let preview: any = null, shape: [number, number] | null = null, dtypes: Record<string, string> | null = null;
      if (res.ok && res.resultPath) {
        const p = await r.runPythonJson<{ rows: number; cols: number; dtypes: Record<string, string>; head: any[] }>(
          ['import os, json, pandas as pd',
           'df = pd.read_csv(os.environ["INPUT_PATH"])',
           'print(json.dumps({"rows": int(df.shape[0]), "cols": int(df.shape[1]), "dtypes": {c: str(t) for c,t in df.dtypes.items()}, "head": df.head(5).where(pd.notnull(df.head(5)), None).to_dict(orient="records")}))'].join('\n'),
          { env: { INPUT_PATH: res.resultPath } },
        );
        if (p.ok && p.json) { shape = [p.json.rows, p.json.cols]; dtypes = p.json.dtypes; preview = p.json.head; }
      }
      return { ok: res.ok, stdout: res.stdout.slice(0, 2000), stderr: res.stderr.slice(0, 2000), result_ref: res.resultPath ?? null, shape, dtypes, head: preview };
    },
  });

  const validateSchema = defineTool({
    name: 'validate_schema',
    description: 'Validate the result CSV matches an expected schema (columns + dtypes). Returns valid flag and violations. Call after run_pandas succeeds.',
    input: v.object({ result_ref: v.string(), expected_columns: v.optional(v.array(v.object({ name: v.string(), type: v.string() }))) }),
    run: async ({ input }) => {
      const expected = JSON.stringify(input.expected_columns ?? []);
      const code = [
        'import os, json, pandas as pd',
        'df = pd.read_csv(os.environ["INPUT_PATH"])',
        'expected = json.loads(os.environ["EXPECTED"])',
        'violations = []',
        'actual = {c: str(t) for c, t in df.dtypes.items()}',
        'expected_names = [e["name"] for e in expected]',
        'for e in expected:',
        '    n, t = e["name"], e["type"]',
        '    if n not in df.columns: violations.append({"column": n, "issue": "missing column"})',
        '    elif t and t.lower() not in actual[n].lower(): violations.append({"column": n, "issue": "dtype " + actual[n] + " != " + t})',
        'if expected:',
        '    for c in df.columns:',
        '        if c not in expected_names: violations.append({"column": c, "issue": "unexpected column"})',
        'print(json.dumps({"valid": len(violations) == 0, "violations": violations, "actual_schema": actual}))',
      ].join('\n');
      const res = await r.runPythonJson(code, { env: { INPUT_PATH: input.result_ref, EXPECTED: expected } });
      if (!res.ok || !res.json) throw new Error('validate_schema failed: ' + (res.stderr || res.stdout));
      return res.json as any;
    },
  });

  const detectAnomalies = defineTool({
    name: 'detect_anomalies',
    description: 'Run data-quality checks on a CSV: IQR outliers on numeric columns, null counts, duplicate rows, non-numeric values in numeric-looking columns. Returns a structured anomaly report. ALWAYS call this; report anomalies proactively.',
    input: v.object({ data_ref: v.string(), columns: v.optional(v.array(v.string())) }),
    run: async ({ input }) => {
      const cols = JSON.stringify(input.columns ?? []);
      const code = [
        'import os, json, pandas as pd, numpy as np',
        'df = pd.read_csv(os.environ["INPUT_PATH"])',
        'cols = json.loads(os.environ["COLS"]) or list(df.columns)',
        'out = []',
        'for c in cols:',
        '    if c not in df.columns: continue',
        '    s = df[c]',
        '    n = int(s.isna().sum())',
        '    if n > 0: out.append({"column": c, "type": "null", "count": n, "samples": [None]*min(n,3)})',
        '    if pd.api.types.is_numeric_dtype(s):',
        '        s2 = pd.to_numeric(s, errors="coerce")',
        '        q1, q3 = s2.quantile(0.25), s2.quantile(0.75); iqr = q3 - q1',
        '        lo, hi = q1 - 1.5*iqr, q3 + 1.5*iqr; mask = (s2 < lo) | (s2 > hi); m = int(mask.sum())',
        '        if m > 0: out.append({"column": c, "type": "outlier", "count": m, "samples": [str(x) for x in s2[mask].head(3).tolist()]})',
        '    else:',
        '        coerced = pd.to_numeric(s, errors="coerce"); present = s.notna() & (s.astype(str).str.strip() != "")',
        '        numeric = coerced.notna() & present; bad = coerced.isna() & present',
        '        b = int(bad.sum()); numeric_count = int(numeric.sum()); present_count = int(present.sum())',
        '        numeric_ratio = (numeric_count / present_count) if present_count else 0',
        '        if numeric_count >= 2 and numeric_ratio >= 0.5 and b > 0: out.append({"column": c, "type": "mixed-numeric", "count": b, "samples": [str(x) for x in s[bad].head(3).tolist()]})',
        'd = int(df.duplicated().sum())',
        'if d > 0: out.append({"column": "(row)", "type": "duplicate", "count": d, "samples": [str(x) for x in df[df.duplicated()].head(3).index.tolist()]})',
        'print(json.dumps({"anomalies": out}))',
      ].join('\n');
      const res = await r.runPythonJson(code, { env: { INPUT_PATH: input.data_ref, COLS: cols } });
      if (!res.ok || !res.json) throw new Error('detect_anomalies failed: ' + (res.stderr || res.stdout));
      return res.json as any;
    },
  });

  const exportResult = defineTool({
    name: 'export_result',
    description: 'Save the cleaned result CSV to a durable output path and return its location, a row preview, and the anomaly_report from detect_anomalies. Call last.',
    input: v.object({
      result_ref: v.string(),
      output_name: v.string(),
      anomaly_report: v.optional(v.array(v.object({ column: v.string(), type: v.string(), count: v.number(), samples: v.array(v.union([v.string(), v.null()])) }))),
    }),
    run: async ({ input }) => {
      const outputName = safeOutputName(input.output_name);
      const outDir = (process.env.DC_OUT_DIR ?? '/tmp/dc-out').replace(/\/$/, '');
      const outputPath = outDir + '/' + outputName;
      await r.saveResult(input.result_ref, outputPath);
      const csv = await r.readCsv(outputPath);
      const lines = csv.trim().split('\n');
      const header = lines[0]?.split(',') ?? [];
      const preview = lines.slice(0, 6).map((l) => l.split(',')).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])));
      const res = await r.runPythonJson<{ rows: number }>(
        'import os, json, pandas as pd; print(json.dumps({"rows": int(pd.read_csv(os.environ["INPUT_PATH"]).shape[0])}))',
        { env: { INPUT_PATH: outputPath } },
      );
      return { output_path: outputPath, rows: res.json?.rows ?? Math.max(lines.length - 1, 0), preview, anomaly_report: input.anomaly_report ?? [] };
    },
  });

  return [inspectData, runPandas, validateSchema, detectAnomalies, exportResult];
}

// back-compat: local-backend tools for simple/dev imports
export const dataCleanerTools = makeDataCleanerTools(undefined as any, 'local');
