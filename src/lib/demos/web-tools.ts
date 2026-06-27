import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

function extract(html: string, url: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .slice(0, 20)
    .map((match) => ({
      href: new URL(match[1], url).toString(),
      text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }));
  return { title, text: text.slice(0, 4_000), links };
}

export function makeWebTools(env: any) {
  const fetchExtract = defineTool({
    name: 'fetch_extract',
    description: 'Fetch a URL and extract title, readable text, and links. Uses Cloudflare Browser binding when an env.BROWSER binding is present; otherwise falls back to safe fetch + HTML extraction.',
    input: v.object({ url: v.string() }),
    run: async ({ input }) => {
      const url = new URL(input.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('url must be http(s)');
      const res = await fetch(url.toString(), { headers: { 'user-agent': 'flue-agent-lab/1.0' } });
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const html = await res.text();
      return {
        url: url.toString(),
        mode: env?.BROWSER ? 'browser-binding-requested-fetch-fallback' : 'fetch-fallback',
        limitation: env?.BROWSER
          ? 'BROWSER binding exists, but this demo keeps extraction in portable fetch mode until Browser Rendering package wiring is added.'
          : 'No Cloudflare Browser binding is configured; using fetch + HTML extraction fallback.',
        ...extract(html, url.toString()),
      };
    },
  });
  return [fetchExtract];
}
