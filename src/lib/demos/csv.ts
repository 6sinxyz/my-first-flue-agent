export interface CsvProfile {
  rows: number;
  cols: number;
  columns: string[];
  head: Record<string, string>[];
  nullCounts: Record<string, number>;
  numericStats: Record<string, { min: number; max: number; mean: number }>;
  elapsedMs: number;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

export function profileCsv(text: string): CsvProfile {
  const started = Date.now();
  const rows = parseCsv(text);
  const columns = rows[0] ?? [];
  const records = rows.slice(1).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i] ?? ''])));
  const nullCounts: Record<string, number> = {};
  const numericValues: Record<string, number[]> = {};
  for (const column of columns) {
    nullCounts[column] = 0;
    numericValues[column] = [];
  }
  for (const record of records) {
    for (const column of columns) {
      const value = (record[column] ?? '').trim();
      if (!value) nullCounts[column] += 1;
      const number = Number(value);
      if (value && Number.isFinite(number)) numericValues[column].push(number);
    }
  }
  const numericStats: CsvProfile['numericStats'] = {};
  for (const [column, values] of Object.entries(numericValues)) {
    if (values.length === 0) continue;
    numericStats[column] = {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }
  return {
    rows: records.length,
    cols: columns.length,
    columns,
    head: records.slice(0, 5),
    nullCounts,
    numericStats,
    elapsedMs: Date.now() - started,
  };
}

export async function loadTextRef(env: any, ref: string): Promise<{ text: string; source: string }> {
  if (/^https?:\/\//i.test(ref)) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`fetch ${ref} failed with ${res.status}`);
    return { text: await res.text(), source: ref };
  }
  if (ref.startsWith('r2://')) {
    const [, bucketName, ...keyParts] = ref.replace('r2://', '').split('/');
    const bucket = env?.[bucketName];
    const key = keyParts.join('/');
    if (!bucket?.get || !key) throw new Error(`R2 binding/key unavailable for ${ref}`);
    const object = await bucket.get(key);
    if (!object) throw new Error(`R2 object not found: ${ref}`);
    return { text: await object.text(), source: ref };
  }
  if (ref.startsWith('inline:')) return { text: ref.slice('inline:'.length), source: 'inline' };
  throw new Error(`unsupported data_ref "${ref}"; use http(s), r2://BINDING/key.csv, or inline: CSV text`);
}
