# Agent Lab demos

These demos cover issues #6-#13 without changing the existing calculator, router, hello-world, or production data-cleaner behavior.

See `docs/calling-flue.md` for raw HTTP, SDK, React, script, and production URL invocation examples.

## Agents and workflow

- `code-mode`: short deterministic JavaScript arithmetic execution. The installed Flue/Cloudflare runtime does not expose a Dynamic Worker code-mode API, so the demo uses a constrained arithmetic parser fallback and reports that limitation.
- `workspace`: durable write/read/list/grep/diff/reset workspace. Files are keyed by the stable agent id and backed by `DemoJsonStore` in production, with an in-memory dev fallback.
- `hybrid-data-cleaner`: Worker-side CSV inspect/validate/anomaly tools plus the existing pandas container tools for transforms. `benchmark_inspect` compares Worker inspect with `inspect_data`.
- `repeatable-report`: Flue `defineWorkflow` equivalent for a repeatable deterministic workflow. `@cloudflare/dynamic-workflows` is not exposed by the installed packages.
- `web-extractor`: URL extraction. Uses safe `fetch` and HTML parsing unless a Cloudflare Browser binding is wired later.
- `docs-rag`: small built-in documentation search agent with citations.
- `email-processor`: test-mode email payload and CSV link/attachment processing. Production Cloudflare Email Routing still needs an `email()` handler/binding setup.
- `memory-dispatcher`: stable-id memory for dispatch decisions over calculator, code-mode, hybrid-data-cleaner, workspace, docs, web, and email demos. Use `reset_memory` to clear it.

## Frontend and scripts

Script patterns:

```sh
pnpm run dev
pnpm run run:code-mode
pnpm run run:workspace
pnpm run run:workflow
pnpm run run:docs-rag
```

Because the production Wrangler config includes the Cloudflare-managed sandbox container image, Cloudflare-target `flue run` may require `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` locally. `pnpm run build`, `pnpm run typecheck`, and `pnpm run deploy:dry` do not require a live deploy.

The frontend pattern is:

```ts
import { createFlueClient } from '@flue/sdk';

const flue = createFlueClient({
  baseUrl: import.meta.env.VITE_FLUE_URL ?? '/',
  token: import.meta.env.VITE_FLUE_API_TOKEN,
});
const result = await flue.agents.prompt('docs-rag', 'browser-session', {
  message: 'How do raw HTTP streams work?',
});
```

`@flue/react` docs are present in the installed Flue docs, but the package is not installed in this repo. If added later, wrap the app with `FlueProvider` and use `useFlueAgent({ name, id })` or `useFlueWorkflow({ runId })`.

## Raw HTTP

Set the production base URL once:

```sh
export PROD_URL="https://my-first-flue-agent.thecatcner.workers.dev"
export FLUE_API_TOKEN="<real-token-value>"
```

Wait for an agent result with `?wait=result`:

```sh
curl -sS "$PROD_URL/agents/docs-rag/demo-docs?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"How do I invoke a Flue workflow?"}'
```

Fire and stream:

```sh
curl -sS "$PROD_URL/agents/workspace/demo-workspace" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"message":"write notes.txt with hello, then list files"}'

curl -N "$PROD_URL/agents/workspace/demo-workspace?offset=-1&live=sse" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
```

Invoke a workflow and wait for the result:

```sh
curl -sS "$PROD_URL/workflows/repeatable-report?wait=result" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FLUE_API_TOKEN" \
  -d '{"input":{"items":["Beta","alpha"," beta "],"label":"prod-demo"}}'
```

Inspect a workflow run:

```sh
curl -sS "$PROD_URL/runs/$RUN_ID?meta" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
curl -N "$PROD_URL/runs/$RUN_ID?offset=-1&live=sse" \
  -H "authorization: Bearer $FLUE_API_TOKEN"
```

## JS SDK

`@flue/sdk` is installed directly for typed clients:

```ts
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: process.env.PROD_URL!,
  token: process.env.FLUE_API_TOKEN!,
});

const code = await client.agents.prompt('code-mode', 'demo-code', {
  message: 'Run 21 * 2',
});

const sent = await client.agents.send('web-extractor', 'demo-web', {
  message: 'Extract https://example.com',
});

for await (const event of client.agents.stream('web-extractor', 'demo-web', {
  offset: sent.offset,
  live: true,
})) {
  console.log(event.type);
  if (event.type === 'idle') break;
}

const workflow = await client.workflows.invoke('repeatable-report', {
  input: { items: ['Beta', 'alpha'] },
  wait: 'result',
});
```

## Example prompts

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
  -d '{"message":"Remember that I prefer docs answers with short citations, then dispatch this: how do agent streams work?"}'
```

## Cloudflare setup gaps

- Dynamic Worker/code mode: no direct API is exported by `@flue/runtime@1.0.0-beta.6` or current project dependencies. The fallback supports arithmetic expressions only and rejects general JavaScript, imports, network calls, timers, and nondeterministic APIs.
- Dynamic workflows: `@cloudflare/dynamic-workflows` is not installed or exposed. `repeatable-report` uses Flue workflow runs, result waiting, and durable event streams.
- Browser Rendering: add a Cloudflare Browser binding and browser rendering package before replacing `web-extractor`'s fetch fallback.
- Email Routing: configure Cloudflare Email Routing to call an `email()` handler for live mail. The current `email-processor` is a test-mode JSON/prompt demo.
