# Agent Streaming Lab

The Worker serves a lightweight browser UI at `/lab` for testing Flue agent streaming in Cloudflare.

## URL

```text
https://my-first-flue-agent.thecatcner.workers.dev/lab
```

## Security model

- The page is static and public, but protected Flue routes still require `Authorization: Bearer <FLUE_API_TOKEN>`.
- The token is never embedded in Worker code or committed files.
- Testers paste the token into the browser; it is saved only in browser `localStorage` for convenience.
- The UI uses `fetch()` plus a `ReadableStream` to consume `?live=sse`, because browser `EventSource` cannot send custom `Authorization` headers.

## Cloudflare/Kumo UI guidance

The UI follows the visual language of Cloudflare's Kumo / Cloudflare 7 design system while staying a zero-build static Worker page:

- semantic surface tokens (`base`, `elevated`, `recessed`, `line`, `hairline`) instead of raw one-off colors;
- Cloudflare brand orange for primary actions and a restrained blue accent for focus/event state;
- accessible focus rings, high-contrast text, rounded controls, and surface hierarchy;
- no embedded secret and no React/Kumo bundle added yet.

Kumo itself is a React component library (`@cloudflare/kumo`) with React peer dependencies. This repo currently does not have a frontend build pipeline, so `/lab` mirrors the token and component style in plain HTML/CSS. A future React migration can replace the static controls with Kumo `Button`, `Input`, `Select`, and related components.

## Supported flow

1. `POST /agents/:name/:id` with `{ "message": "..." }`.
2. Read the returned `offset` and `submissionId`.
3. `GET /agents/:name/:id?offset=<offset>&live=sse` with the same bearer token.
4. Render raw events, extracted text, timings, and errors.

This follows the same raw HTTP pattern documented in `docs/calling-flue.md` while keeping the implementation small enough to deploy with the existing Worker build.
