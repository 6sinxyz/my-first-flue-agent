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

export function makeEmailTools(env?: any) {
  const processEmailPayload = defineTool({
    name: 'process_email_payload',
    description:
      'Process a test-mode email payload, extract CSV links/attachments, profile CSV links, and produce data-cleaner handoff prompts plus suggested export paths. This documents Cloudflare Email binding behavior but does not require live routing.',
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
          'Production Email Workers require an email() handler/binding in Cloudflare Email Routing. This Flue demo accepts test JSON payloads through the agent route and produces data-cleaner handoff prompts/export paths.',
      } as unknown as JsonValue;
    },
  });
  return [processEmailPayload];
}
