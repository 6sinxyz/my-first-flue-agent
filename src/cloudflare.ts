/**
 * Flue Cloudflare deployment module (src/cloudflare.ts).
 * Named exports become top-level Worker exports. We re-export the
 * @cloudflare/sandbox `Sandbox` Durable Object class so the Worker can host the
 * container-backed sandbox used by the data-cleaner agent (Phase 2).
 *
 * Bind in wrangler as a Durable Object (class_name "Sandbox") + declare the
 * container image via top-level `containers`. See wrangler.containers.jsonc.
 */
export { Sandbox } from '@cloudflare/sandbox';

const EMAIL_EVENT_PREFIX = 'email-events/';
const EMAIL_RAW_PREFIX = 'email-raw/';

export class DemoJsonStore {
  constructor(private readonly state: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (request.method === 'GET') {
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      const value = await this.state.storage.get(key);
      if (value === undefined) return Response.json({ error: 'not found' }, { status: 404 });
      return Response.json(value);
    }
    if (request.method === 'PUT') {
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      await this.state.storage.put(key, await request.json());
      return Response.json({ ok: true });
    }
    if (request.method === 'DELETE') {
      if (key) await this.state.storage.delete(key);
      else await this.state.storage.deleteAll();
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }
}

async function handleEmail(message: any, env: any) {
  const bucket = env?.DATA_R2;
  if (!bucket?.put) {
    message.setReject?.('DATA_R2 R2 binding is not configured for live email ingestion.');
    return;
  }

  const rawBytes = await new Response(message.raw).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', rawBytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const receivedAt = new Date().toISOString();
  const id = `${receivedAt.replace(/[:.]/g, '-')}-${hash.slice(0, 16)}`;
  const rawKey = `${EMAIL_RAW_PREFIX}${id}.eml`;
  const eventKey = `${EMAIL_EVENT_PREFIX}${id}.json`;
  const headers = headersToObject(message.headers);
  const metadata = {
    id,
    received_at: receivedAt,
    from: String(message.from ?? ''),
    to: String(message.to ?? ''),
    raw_key: rawKey,
    raw_bytes: rawBytes.byteLength,
    sha256: hash,
    headers,
    data_ref: `r2://DATA_R2/${rawKey}`,
    note: 'Raw MIME stored by the Worker email() handler. Configure Cloudflare Email Routing to route a verified address to this Worker.',
  };

  await bucket.put(rawKey, rawBytes, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: {
      from: metadata.from.slice(0, 256),
      to: metadata.to.slice(0, 256),
      received_at: receivedAt,
      sha256: hash,
    },
  });
  await bucket.put(eventKey, JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      from: metadata.from.slice(0, 256),
      to: metadata.to.slice(0, 256),
      received_at: receivedAt,
      raw_key: rawKey,
    },
  });
}

function headersToObject(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, key) => { out[key] = value; });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0]).toLowerCase()] = String(pair[1]);
    }
    return out;
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) out[key.toLowerCase()] = String(value);
  }
  return out;
}

export default {
  email: handleEmail,
};
