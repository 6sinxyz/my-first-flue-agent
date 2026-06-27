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

## Supported flow

1. `POST /agents/:name/:id` with `{ "message": "..." }`.
2. Read the returned `offset` and `submissionId`.
3. `GET /agents/:name/:id?offset=<offset>&live=sse` with the same bearer token.
4. Render raw events, extracted text, timings, and errors.

This follows the same raw HTTP pattern documented in `docs/calling-flue.md` while keeping the implementation small enough to deploy with the existing Worker build.
