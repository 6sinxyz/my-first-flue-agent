# Calling Flue

Set a production URL once:

```sh
export PROD_URL="https://my-first-flue-agent.<your-workers-subdomain>.workers.dev"
```

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

## Raw HTTP

Wait for an agent result:

```sh
curl -sS "$PROD_URL/agents/docs-rag/demo-docs?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"How do Flue runs and streams work?"}'
```

Fire and stream:

```sh
receipt=$(curl -sS "$PROD_URL/agents/workspace/demo-workspace" \
  -H 'content-type: application/json' \
  -d '{"message":"write notes.txt with hello, then list files"}')

offset=$(node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).offset))' <<< "$receipt")
curl -N "$PROD_URL/agents/workspace/demo-workspace?offset=$offset&live=sse"
```

Workflow result and streams:

```sh
curl -sS "$PROD_URL/workflows/repeatable-report?wait=result" \
  -H 'content-type: application/json' \
  -d '{"input":{"items":["Beta","alpha"," beta "],"label":"prod-demo"}}'

curl -sS "$PROD_URL/runs/$RUN_ID?meta"
curl -N "$PROD_URL/runs/$RUN_ID?offset=-1&live=sse"
```

## JS SDK

`@flue/sdk` is installed directly.

```ts
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({ baseUrl: process.env.PROD_URL! });

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

const client = createFlueClient({ baseUrl: '/' });

function Chat() {
  const agent = useFlueAgent({ name: 'docs-rag', id: 'browser-session' });
  return <button onClick={() => agent.sendMessage('How do raw streams work?')}>Ask</button>;
}

export function App() {
  return <FlueProvider client={client}><Chat /></FlueProvider>;
}
```

## Existing prod agents

```sh
curl -sS "$PROD_URL/agents/hello-world/prod-demo?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"hello from prod"}'

curl -sS "$PROD_URL/agents/calculator/prod-calc?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Compute 12 * 7 + 3"}'

curl -sS "$PROD_URL/agents/router/prod-router?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Ask calculator to compute 19 * 6"}'

curl -sS "$PROD_URL/agents/data-cleaner/prod-cleaner?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Inspect and clean CSV at https://example.com/customers.csv. Prefer URL/R2 data refs in prod; use local filesystem paths only for dev fallback."}'
```

## New demos

```sh
curl -sS "$PROD_URL/agents/code-mode/demo-code?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Run (10 + 5) * 3"}'

curl -sS "$PROD_URL/agents/hybrid-data-cleaner/demo-data?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Use lightweight inspect on inline:name,age\nA,10\nB,"}'

curl -sS "$PROD_URL/agents/email-processor/demo-email?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Process this email payload: from ops@example.com, subject CSV, text https://example.com/file.csv"}'

curl -sS "$PROD_URL/agents/memory-dispatcher/alice?wait=result" \
  -H 'content-type: application/json' \
  -d '{"message":"Remember that I prefer short cited docs answers, then dispatch this: how do agent streams work?"}'
```
