import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { loadTextRef, profileCsv } from './csv.js';

function csvLinks(text: string) {
  const links = Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+\.csv(?:\?[^\s"'<>]+)?/gi)).map((match) => match[0]);
  return [...new Set(links)];
}

function outputName(url: string, index: number) {
  const clean = url.split('?')[0]?.split('/').pop()?.replace(/[^a-z0-9_.-]/gi, '_') || `attachment-${index}.csv`;
  return `email-cleaned-${clean}`;
}

async function listEmailEvents(env: any, limit: number) {
  const bucket = env?.DATA_R2;
  if (!bucket?.list) return { configured: false, events: [], note: 'DATA_R2 R2 binding is not configured.' };
  const listed = await bucket.list({ prefix: 'email-events/', limit });
  const events = [];
  for (const object of listed.objects ?? []) {
    const item = await bucket.get(object.key);
    if (!item) continue;
    try {
      events.push(JSON.parse(await item.text()));
    } catch {
      events.push({ key: object.key, size: object.size, uploaded: object.uploaded?.toISOString?.() ?? String(object.uploaded ?? '') });
    }
  }
  return { configured: true, events };
}

async function readEmailEvent(env: any, eventKeyOrId: string, includeRaw: boolean) {
  const bucket = env?.DATA_R2;
  if (!bucket?.get) return { configured: false, error: 'DATA_R2 R2 binding is not configured.' };
  const key = eventKeyOrId.startsWith('email-events/') ? eventKeyOrId : `email-events/${eventKeyOrId.replace(/\.json$/, '')}.json`;
  const object = await bucket.get(key);
  if (!object) return { configured: true, found: false, key };
  const metadata = JSON.parse(await object.text());
  let raw_preview: string | undefined;
  if (includeRaw && metadata.raw_key) {
    const raw = await bucket.get(metadata.raw_key);
    if (raw) raw_preview = (await raw.text()).slice(0, 4000);
  }
  return { configured: true, found: true, key, metadata, raw_preview };
}

export function makeEmailTools(env?: any) {
  const processEmailPayload = defineTool({
    name: 'process_email_payload',
    description:
      'Process a test-mode email payload, extract CSV links/attachments, profile CSV links, and produce data-cleaner handoff prompts plus suggested export paths. For live routed email, use list_stored_emails/read_stored_email after Cloudflare Email Routing delivers messages to the Worker email() handler.',
    input: v.object({
      from: v.string(),
      subject: v.string(),
      text: v.string(),
      attachments: v.optional(v.array(v.object({ filename: v.string(), content_type: v.string(), content: v.string() }))),
    }),
    run: async ({ input }) => {
      const links = csvLinks(input.text);
      const csvAttachments = (input.attachments ?? []).filter((attachment) =>
        attachment.filename.toLowerCase().endsWith('.csv') || attachment.content_type.includes('csv'),
      );
      const cleaningJobs = [];
      for (const [index, url] of links.entries()) {
        let profile: unknown = null;
        let profileError: string | null = null;
        try {
          const { text } = await loadTextRef(env, url);
          profile = profileCsv(text);
        } catch (error) {
          profileError = error instanceof Error ? error.message : String(error);
        }
        const exportName = outputName(url, index + 1);
        cleaningJobs.push({
          data_ref: url,
          agent: 'hybrid-data-cleaner',
          suggested_export_path: `/tmp/dc-out/${exportName}`,
          cleaning_summary: profile
            ? { profile, recommendation: 'Run hybrid-data-cleaner with this URL; use lightweight inspect first and pandas only for transforms.' }
            : { error: profileError },
          data_cleaner_message: `Clean CSV at ${url}. Use lightweight_inspect first, then run_pandas only if transforms are needed. Export as ${exportName} and report anomalies.`,
        });
      }
      return {
        from: input.from,
        subject: input.subject,
        csv_links: links,
        csv_attachments: csvAttachments.map((attachment, index) => ({
          filename: attachment.filename,
          bytes: attachment.content.length,
          suggested_export_path: `/tmp/dc-out/${outputName(attachment.filename, index + 1)}`,
          note: 'Attachment bytes are reported in test mode. Production should upload attachments to R2 and pass an r2:// or signed URL data_ref to data-cleaner.',
        })),
        cleaning_jobs: cleaningJobs,
        setup_note:
          'This Worker includes a live email() handler that stores routed raw MIME and metadata in DATA_R2. Configure Cloudflare Email Routing for a verified domain/address to deliver live mail to this Worker. Test JSON payloads through the agent route remain supported.',
      } as unknown as JsonValue;
    },
  });

  const listStoredEmails = defineTool({
    name: 'list_stored_emails',
    description: 'List recent live email events stored in DATA_R2 by the Worker email() handler.',
    input: v.object({ limit: v.optional(v.number()) }),
    run: async ({ input }) => (await listEmailEvents(env, Math.max(1, Math.min(50, input.limit ?? 10)))) as unknown as JsonValue,
  });

  const readStoredEmail = defineTool({
    name: 'read_stored_email',
    description: 'Read one live email event metadata record from DATA_R2, optionally including a raw MIME preview.',
    input: v.object({ key_or_id: v.string(), include_raw_preview: v.optional(v.boolean()) }),
    run: async ({ input }) => (await readEmailEvent(env, input.key_or_id, input.include_raw_preview ?? false)) as unknown as JsonValue,
  });

  return [processEmailPayload, listStoredEmails, readStoredEmail];
}
