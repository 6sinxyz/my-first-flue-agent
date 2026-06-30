# Live Email Routing setup

The Worker now exports a real Cloudflare Email Workers `email()` handler from `src/cloudflare.ts`.

What it does:

- receives routed messages from Cloudflare Email Routing
- stores raw MIME in R2 under `email-raw/<id>.eml`
- stores metadata in R2 under `email-events/<id>.json`
- exposes those records to the `email-processor` agent through:
  - `list_stored_emails`
  - `read_stored_email`

Configured binding:

```json
{
  "binding": "DATA_R2",
  "bucket_name": "my-first-flue-agent-data"
}
```

## Current account status

At implementation time, `wrangler email routing list` returned:

```text
No zones found with Email Routing in this account.
```

So the code and R2 binding are live, but Cloudflare cannot deliver email to the Worker until a domain is added/enabled for Email Routing.

## Enable a route once a domain is available

Replace `example.com` and `agent@example.com` with the verified domain/address:

```bash
pnpm exec wrangler email routing enable example.com \
  --config dist/my_first_flue_agent/wrangler.json

pnpm exec wrangler email routing rules create example.com \
  --name "my-first-flue-agent email ingest" \
  --enabled true \
  --match-type literal \
  --match-field to \
  --match-value agent@example.com \
  --action-type worker \
  --action-value my-first-flue-agent \
  --config dist/my_first_flue_agent/wrangler.json
```

After delivery, inspect messages through `/lab` with `email-processor`:

```text
List stored live email events with limit 5 and report DATA_R2 status.
```

For one event:

```text
Read stored email event <id-or-email-events/key.json> with raw preview and summarize sender, recipient, and storage refs.
```
