# Calling the Flue Worker

The deployed Worker requires a bearer token on protected Flue routes:

```http
Authorization: Bearer <FLUE_API_TOKEN>
```

Protected routes include `/agents/*`, `/workflows/*`, `/runs/*`, and
`/channels/*`. `OPTIONS` preflight requests are allowed and return CORS headers.

## Configure the token

Set the production secret before deploying:

```sh
pnpm run build
printf '<real-token-value>' | pnpm exec wrangler secret put FLUE_API_TOKEN --config dist/my_first_flue_agent/wrangler.json
pnpm run deploy
```

For local development, provide the same variable in the shell or in `.dev.vars`:

```sh
FLUE_API_TOKEN=local-dev-token pnpm run dev
```

Do not commit real token values.

## Power Automate HTTP action

Use the **HTTP** action with these fields:

| Field | Value |
| --- | --- |
| Method | `POST` |
| URI | `https://my-first-flue-agent.thecatcner.workers.dev/agents/hello-world/power-automate?wait=result` |
| Headers | `Content-Type: application/json` and `Authorization: Bearer <FLUE_API_TOKEN>` |
| Body | `{"message":"hello from Power Automate"}` |

The same header is required for other agents. Example data-cleaner request:

| Field | Value |
| --- | --- |
| Method | `POST` |
| URI | `https://my-first-flue-agent.thecatcner.workers.dev/agents/data-cleaner/power-automate?wait=result` |
| Headers | `Content-Type: application/json` and `Authorization: Bearer <FLUE_API_TOKEN>` |
| Body | `{"message":"Inspect this CSV and summarize quality issues: https://example.com/customers.csv"}` |

## curl examples

Unauthenticated and wrong-token calls return `401` JSON:

```sh
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}' \
  'https://my-first-flue-agent.thecatcner.workers.dev/agents/hello-world/manual?wait=result'

curl -i \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wrong-token' \
  -d '{"message":"hello"}' \
  'https://my-first-flue-agent.thecatcner.workers.dev/agents/hello-world/manual?wait=result'
```

Authenticated calls include the bearer token:

```sh
curl -i \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"hello"}' \
  'https://my-first-flue-agent.thecatcner.workers.dev/agents/hello-world/manual?wait=result'
```
