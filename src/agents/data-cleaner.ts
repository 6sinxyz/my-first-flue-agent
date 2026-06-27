/**
 * data-cleaner agent (Phase 1+2).
 * Natural-language pandas ETL + automatic data-quality checks.
 *
 * Phase 2: when env.Sandbox is present, tools run pandas in a real
 * @cloudflare/sandbox container (python3+pandas image built from
 * sandbox/Dockerfile). In local dev (no Sandbox binding) they fall back to the
 * pyrunner HTTP service. Backend selection is automatic via createRunner().
 *
 * Workflow: inspect_data -> run_pandas (retry on error) -> validate_schema ->
 * detect_anomalies -> export_result. Anomalies reported proactively.
 */
import { defineAgent } from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';
import { getSandbox } from '@cloudflare/sandbox';
import { makeDataCleanerTools } from '../lib/data-cleaner/tools.js';

export const route = async (_c: any, next: any) => next();

export default defineAgent(({ id, env }: { id: string; env: any }) => {
  const hasSandbox = Boolean(env?.Sandbox);
  return {
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    instructions: `You are a data-cleaning agent that turns natural-language ETL specs into pandas code and runs it, with automatic data-quality checks.

Workflow (follow strictly):
1. inspect_data({data_ref}) — profile the input CSV (columns, dtypes, nulls, ranges).
2. Write pandas code for the transform_spec + output_format. Input CSV is at env var INPUT_PATH inside python. You MUST write the cleaned dataframe to env var RESULT_PATH:
   df.to_csv(os.environ["RESULT_PATH"], index=False)
   Call run_pandas({code, data_ref}). On error, READ stderr, fix the code, retry (max 3).
3. validate_schema({result_ref, expected_columns}) — check output matches output_format. Fix & re-run if violations.
4. detect_anomalies({data_ref: result_ref}) — ALWAYS call on the cleaned result. Capture anomalies.
5. export_result({result_ref, output_name, anomaly_report}) — deliver cleaned CSV path + preview + anomaly report.

Rules: NEVER compute results yourself (always run_pandas). NEVER silently drop anomalies — state them in your final answer. Keep code minimal; pandas + numpy only.`,
    tools: makeDataCleanerTools(env, id),
    // Phase 2: container sandbox when the binding exists (prod). Dev (no binding)
    // keeps the default virtual sandbox + local pyrunner HTTP backend.
    ...(hasSandbox ? { sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)) } : {}),
  };
});
