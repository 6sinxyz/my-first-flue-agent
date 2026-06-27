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
export default {};
