# Agent Streaming Lab

The Worker serves a Kumo-powered browser UI at `/lab` for testing Flue agent streaming in Cloudflare.

## URL

```text
https://my-first-flue-agent.thecatcner.workers.dev/lab
```

For the current draft PR preview on alexa/Tailscale:

```text
http://100.114.29.109:18994/lab
```

## Security model

- The page is public, but protected Flue routes still require `Authorization: Bearer <FLUE_API_TOKEN>`.
- The token is never embedded in Worker code or committed files.
- Testers paste the token into the browser; it is saved only in browser `localStorage` for convenience.
- The UI uses `fetch()` plus a `ReadableStream` to consume `?live=sse`, because browser `EventSource` cannot send custom `Authorization` headers.

## Kumo / Cloudflare 7 implementation

This UI is a real React frontend built with Cloudflare's Kumo component library:

- `@cloudflare/kumo`
- `react` / `react-dom`
- `@phosphor-icons/react`
- `vite`
- `@tailwindcss/vite`
- `@cloudflare/kumo/styles/standalone`

The Kumo/Vite app lives in `lab/`. `pnpm run build:lab` builds it and `scripts/generate-lab-html.mjs` inlines the resulting CSS/JS into `src/frontend.generated.ts`, which the existing Worker serves at `/lab`. This keeps deployment inside the existing Flue Worker while still using Kumo components instead of hand-written imitation styles.

Do not edit `src/frontend.generated.ts` by hand; edit `lab/src/*` and rerun `pnpm run build:lab` or `pnpm run build`.

## Supported flow

1. `POST /agents/:name/:id` with `{ "message": "..." }`.
2. Read the returned `offset` and `submissionId`.
3. `GET /agents/:name/:id?offset=<offset>&live=sse` with the same bearer token.
4. Render raw events, extracted text, timings, and errors.

This follows the same raw HTTP pattern documented in `docs/calling-flue.md`.

## Validation

```sh
pnpm run typecheck
pnpm run build
pnpm run deploy:dry
```

Preview:

```sh
pnpm run build
FLUE_API_TOKEN="$(cat ~/.config/my-first-flue-agent/FLUE_API_TOKEN.txt)" \
  pnpm exec wrangler dev --config dist/my_first_flue_agent/wrangler.json \
  --port 18994 --ip 0.0.0.0 --remote
```
