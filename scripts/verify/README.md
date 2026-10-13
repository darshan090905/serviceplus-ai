# Tests

Thirty-one harnesses, in three kinds. The distinction matters: **two of the three
kinds talk to the live database**, and one of those deletes rows.

| Command | What runs | Needs | Writes to the live DB |
|---|---|---|---|
| `npm test` | 8 pure harnesses, 348 assertions | nothing | no |
| `npm run test:live` | the above + invoice access + 31 RLS behaviour checks | `.env` | temp rows, cleaned up |
| `npm run test:e2e` | the above + 21 browser tests | `npm run dev` running, Edge | **yes** |
| `npm run test:all` | everything | both | **yes** |
| `npm run typecheck` | `tsc --noEmit` | — | no |

`npm test` is safe to run on any machine, at any time, with no setup. That is
deliberate: the pure harnesses are the ones that catch the arithmetic and
date-handling bugs, which are the ones that actually regress.

## Why the e2e tier is gated

`verify-clean-state`, `verify-complaint-delete`, `verify-inbox-delete`,
`verify-svc` and friends drive a real browser against a real dev server. The app
persists as it goes, so they create, edit and delete rows in whatever database
`.env` points at. They are not in `npm test` for the same reason `db:clean` is
not in `npm test`.

## Pointing the e2e tier at a different port

The browser harnesses read `E2E_BASE` and default to `http://localhost:5174`,
which is what `vite.config.ts` serves. If you run the app elsewhere:

```bash
E2E_BASE=http://localhost:3000 npm run test:e2e
```

## Adding a harness

Drop a `verify-*.mjs` file in this directory. Exit non-zero on failure and print
`N passed, M failed` as the last line — the runner reads that line for the
summary. Nothing needs registering; the runner classifies each file by what it
imports, so a new harness is picked up automatically:

- imports `playwright` → `e2e`
- references `VITE_SUPABASE_URL` or `createClient` → `live`
- anything else → `pure`

Run a subset while working:

```bash
node --import tsx scripts/verify/run.mjs --only ftf gst
node --import tsx scripts/verify/run.mjs --only ftf --live
```

## Layout notes

- `verify-*.mjs` in this directory — the suite. Tracked in git.
- `scripts/tmp-scan/` — gitignored scratch. A `seed-new-people.mjs` lives there
  and writes to the live database, which is exactly why it is not in the repo.
- `scripts/pptx/` — unrelated slide tooling.
