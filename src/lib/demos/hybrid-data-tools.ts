import { defineTool } from '@flue/runtime';
import type { JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { makeDataCleanerTools } from '../data-cleaner/tools.js';
import { loadTextRef, profileCsv } from './csv.js';

export function makeHybridDataTools(env: any, agentId: string) {
  const baseTools = makeDataCleanerTools(env, agentId);

  const lightweightInspect = defineTool({
    name: 'lightweight_inspect',
    description: 'Inspect CSV data in the Worker without starting a pandas container. Supports http(s), r2://BINDING/key.csv, and inline: CSV text.',
    input: v.object({ data_ref: v.string() }),
    run: async ({ input }) => {
      const { text, source } = await loadTextRef(env, input.data_ref);
      return { source, profile: profileCsv(text), mode: 'worker-csv-parser' } as unknown as JsonValue;
    },
  });

  const lightweightValidate = defineTool({
    name: 'lightweight_validate',
    description: 'Validate required columns in CSV data in the Worker without container startup.',
    input: v.object({ data_ref: v.string(), required_columns: v.array(v.string()) }),
    run: async ({ input }) => {
      const { text } = await loadTextRef(env, input.data_ref);
      const profile = profileCsv(text);
      const missing = input.required_columns.filter((column) => !profile.columns.includes(column));
      return { valid: missing.length === 0, missing, columns: profile.columns };
    },
  });

  const lightweightAnomalies = defineTool({
    name: 'lightweight_anomalies',
    description: 'Detect nulls and numeric min/max anomalies in the Worker. Use pandas only for transforms or deeper statistics.',
    input: v.object({ data_ref: v.string() }),
    run: async ({ input }) => {
      const { text } = await loadTextRef(env, input.data_ref);
      const profile = profileCsv(text);
      const anomalies = [
        ...Object.entries(profile.nullCounts)
          .filter(([, count]) => count > 0)
          .map(([column, count]) => ({ column, type: 'null', count })),
        ...Object.entries(profile.numericStats)
          .filter(([, stats]) => stats.min < 0)
          .map(([column, stats]) => ({ column, type: 'negative-value', count: 1, sample: stats.min })),
      ];
      return { anomalies, mode: 'worker-csv-parser' };
    },
  });

  const benchmarkInspect = defineTool({
    name: 'benchmark_inspect',
    description: 'Compare lightweight Worker inspect against the current pandas inspect_data tool when the data_ref is supported by both backends.',
    input: v.object({ data_ref: v.string() }),
    run: async ({ input }) => {
      const lightStarted = Date.now();
      const { text } = await loadTextRef(env, input.data_ref);
      const lightweight = profileCsv(text);
      const lightMs = Date.now() - lightStarted;
      const inspectData = baseTools.find((tool) => tool.name === 'inspect_data');
      const pandasStarted = Date.now();
      let pandas: unknown = null;
      let pandasError: string | null = null;
      try {
        pandas = inspectData ? await inspectData.run({ input: { data_ref: input.data_ref } } as any) : null;
      } catch (error) {
        pandasError = error instanceof Error ? error.message : String(error);
      }
      return {
        lightweight_ms: lightMs,
        pandas_ms: pandasError ? null : Date.now() - pandasStarted,
        lightweight,
        pandas,
        pandas_error: pandasError,
      } as unknown as JsonValue;
    },
  });

  return [lightweightInspect, lightweightValidate, lightweightAnomalies, benchmarkInspect, ...baseTools];
}
