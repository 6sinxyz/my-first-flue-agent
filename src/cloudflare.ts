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

export default {};
