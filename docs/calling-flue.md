# Calling the Flue Worker

Set the production URL and bearer token once:

```sh
export PROD_URL="https://my-first-flue-agent.thecatcner.workers.dev"
export FLUE_API_TOKEN="<real-token-value>"
```

The deployed Worker requires this header on protected Flue routes:

```http
Authorization: Bearer <FLUE_API_TOKEN>
```

Protected routes include `/agents/*`, `/workflows/*`, `/runs/*`, and `/channels/*`. `OPTIONS` preflight requests are allowed and return CORS headers.

## Configure the token

Set the production secret before deploying auth-enabled builds:

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

## Scripts

```sh
pnpm run typecheck
pnpm run build
pnpm run deploy:dry
pnpm run run:hello
pnpm run run:code-mode
pnpm run run:workspace
pnpm run run:workflow
pnpm run run:docs-rag
```

Cloudflare-target `flue run` uses the production Wrangler config. Because this repo binds the `@cloudflare/sandbox@0.9.1` managed container image, local `flue run` can require `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

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

## Raw HTTP

Unauthenticated and wrong-token calls return `401` JSON:

```sh
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}' \
  "$PROD_URL/agents/hello-world/manual?wait=result"

curl -i \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wrong-token' \
  -d '{"message":"hello"}' \
  "$PROD_URL/agents/hello-world/manual?wait=result"
```

Wait for an agent result:

```sh
curl -sS "$PROD_URL/agents/docs-rag/demo-docs?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"How do Flue runs and streams work?"}'
```

Fire and stream:

```sh
receipt=$(curl -sS "$PROD_URL/agents/workspace/demo-workspace" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"write notes.txt with hello, then list files"}')

offset=$(node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).offset))' <<< "$receipt")
curl -N "$PROD_URL/agents/workspace/demo-workspace?offset=$offset&live=sse" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
```

Workflow result and streams:

```sh
curl -sS "$PROD_URL/workflows/repeatable-report?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"items":["Beta","alpha"," beta "],"label":"prod-demo"}'

curl -sS "$PROD_URL/runs/$RUN_ID?meta" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
curl -N "$PROD_URL/runs/$RUN_ID?offset=-1&live=sse" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
```

## Existing prod agents

```sh
curl -sS "$PROD_URL/agents/hello-world/prod-demo?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"hello from prod"}'

curl -sS "$PROD_URL/agents/calculator/prod-calc?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Compute 12 * 7 + 3"}'

curl -sS "$PROD_URL/agents/router/prod-router?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Ask calculator to compute 19 * 6"}'

curl -sS "$PROD_URL/agents/data-cleaner/prod-cleaner?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Inspect and clean CSV at https://example.com/customers.csv. Prefer URL/R2 data refs in prod; use local filesystem paths only for dev fallback."}'
```

## New demos

```sh
curl -sS "$PROD_URL/agents/code-mode/demo-code?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Run (10 + 5) * 3"}'

curl -sS "$PROD_URL/agents/hybrid-data-cleaner/demo-data?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Use lightweight inspect on inline:name,age\nA,10\nB,"}'

curl -sS "$PROD_URL/agents/email-processor/demo-email?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Process this email payload: from ops@example.com, subject CSV, text https://example.com/file.csv"}'

curl -sS "$PROD_URL/agents/memory-dispatcher/alice?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"Remember that I prefer short cited docs answers, then dispatch this: how do agent streams work?"}'
```

## JS SDK

`@flue/sdk` is installed directly. Pass `token` so SDK HTTP calls and Durable Streams include the bearer token.

```ts
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: process.env.PROD_URL!,
  token: process.env.FLUE_API_TOKEN!,
});

const answer = await client.agents.prompt('calculator', 'demo-calc', {
  message: 'Compute 12 * 7 + 3',
});

const sent = await client.agents.send('docs-rag', 'demo-docs', {
  message: 'How do I wait for an agent result?',
});

for await (const event of client.agents.stream('docs-rag', 'demo-docs', {
  offset: sent.offset,
  live: true,
})) {
  console.log(event.type);
  if (event.type === 'idle') break;
}

const report = await client.workflows.invoke('repeatable-report', {
  input: { items: ['Beta', 'alpha'] },
  wait: 'result',
});
```

## React

The installed Flue docs include `@flue/react` examples, but this repo does not install that package. If it is added later:

```tsx
import { FlueProvider, useFlueAgent } from '@flue/react';
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: '/',
  token: window.localStorage.getItem('flue_api_token') ?? '',
});

function Chat() {
  const agent = useFlueAgent({ name: 'docs-rag', id: 'browser-session' });
  return <button onClick={() => agent.sendMessage('How do raw streams work?')}>Ask</button>;
}

export function App() {
  return <FlueProvider client={client}><Chat /></FlueProvider>;
}
```
