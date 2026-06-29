import { defineTool } from '@flue/runtime';
import puppeteer from '@cloudflare/puppeteer';
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

async function browserExtract(binding: unknown, url: string) {
  const browser = await puppeteer.launch(binding as any);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15_000 });
    const title = await page.title();
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })));
    return { title, text: text.replace(/\s+/g, ' ').trim().slice(0, 4_000), links };
  } finally {
    await browser.close();
  }
}

async function fetchExtract(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'flue-agent-lab/1.0' } });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return extract(await res.text(), url);
}

export function makeWebTools(env: any) {
  const fetchExtractTool = defineTool({
    name: 'fetch_extract',
    description: 'Extract a URL using Cloudflare Browser Rendering when BROWSER is bound; otherwise use fetch + static HTML extraction and report the backend used.',
    input: v.object({ url: v.string() }),
    run: async ({ input }) => {
      const url = new URL(input.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('url must be http(s)');
      if (env?.BROWSER) {
        try {
          return { url: url.toString(), backend: 'cloudflare-browser-rendering', ...(await browserExtract(env.BROWSER, url.toString())) };
        } catch (error) {
          return {
            url: url.toString(),
            backend: 'fetch-html-fallback',
            browser_error: error instanceof Error ? error.message : String(error),
            ...(await fetchExtract(url.toString())),
          };
        }
      }
      return { url: url.toString(), backend: 'fetch-html-fallback', capability: 'static-html-only', ...(await fetchExtract(url.toString())) };
    },
  });
  return [fetchExtractTool];
}
