# MK AI Workforce — Operations Runbook (Phase 2F)

Operational reference for the workspace application: local setup, environment
variables, migrations, tests, the AI worker and queue, logging and audit review,
backup/restore (documented only), performance notes, pre-deployment checks,
rollback and known limitations.

This document contains no secret values. Environment variable **names** are
listed with their purpose; every value belongs in the hosting provider's
environment settings or in a git-ignored `.env.local` file with restrictive
permissions.

All commands are written for the repository root. Nothing in this document has
been executed against production as part of Phase 2F. Deployments, migrations,
environment changes and production data operations require explicit approval.

---

## 1. Runtime topology

| Component | Responsibility |
| --- | --- |
| Next.js web app | Server-rendered workspace, API routes, Auth.js magic-link sign-in |
| PostgreSQL | Single database for auth, workspace, business, AI and queue data |
| AI worker (`scripts/ai-worker.mjs`) | Consumes pg-boss jobs; the only process that calls AI providers |
| Email delivery | Resend in production, SMTP (Mailpit) locally, for magic links and invitations |
| pg-boss | Queue tables in schema `pgboss` inside the same PostgreSQL database |

The web app never calls an AI provider inside a request handler. It creates a run
row, enqueues a job and returns. The worker performs provider calls.

---

## 2. Local development setup

Prerequisites:

- Node.js 24 and npm (the test harness uses `node:module` `registerHooks`).
- PostgreSQL reachable on loopback. The example configuration uses
  `mk_workforce_dev` for development and `mk_workforce_test` for tests; the test
  database name must end in `_test`.
- Mailpit for local email: SMTP on `127.0.0.1:1025`, web UI at
  `http://localhost:8025`.
- Optional: a second terminal for the AI worker.

Steps:

1. `npm install`
2. `cp .env.example .env.local`, then fill in local values. Restrict the file:
   `chmod 600 .env.local`. It is git-ignored and must never be committed.
3. Create the development and test databases, then migrate both:
   - Development: `npm run db:migrate:local`
   - Test: run the same command with `DATABASE_URL` set to the disposable test
     database for that invocation. Do not put the test URL into `DATABASE_URL`
     permanently.
4. `npm run dev` — web app on `http://localhost:3000`.
5. Open `http://localhost:3000/workspace`, request a magic link for
   `WORKSPACE_OWNER_EMAIL`, read it in Mailpit and follow the link. The
   configured owner address bootstraps the first owner membership.
6. Check readiness: `curl -s http://localhost:3000/api/workforce/health`
   (returns booleans and labels only — no secrets).
7. Optional worker: `npm run ai:worker` in a separate terminal, then check
   `curl -s http://127.0.0.1:4319/health`.

Local email must use `EMAIL_TRANSPORT=smtp` with `SMTP_HOST`/`SMTP_PORT` and no
`RESEND_API_KEY`, so no real email can leave the machine.

---

## 3. Environment variables

Names only. Set values in the deployment environment or locally in
`.env.local`; never in git, logs, screenshots or reports.

### Core database and authentication

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Drizzle, Auth.js, the worker and health checks. Server-side only. |
| `DB_DRIVER` | Optional explicit driver: `node-postgres` or `neon-http`. Loopback URLs otherwise select `node-postgres`; remote URLs select `neon-http`. |
| `ALLOW_REMOTE_DB` | Development-only guard override that permits `node-postgres` against a non-loopback database outside production. Do not rely on it in production. |
| `AUTH_SECRET` | Signs session cookies and hashes magic-link tokens. Unique per environment. |
| `AUTH_URL` | Canonical origin used for magic-link and invitation links. Must match the deployed workspace origin exactly (documented production value in `.env.example`). |
| `AUTH_EMAIL_FROM` | Verified sender address for sign-in and invitation email. |
| `WORKSPACE_OWNER_EMAIL` | First owner address allowed to sign in before any invitation; becomes the initial owner on first login. Change only after ownership is recorded in the database. |
| `SESSION_MAX_AGE_SECONDS` | Optional local testing aid to shorten sessions. |

### Email delivery

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key for workspace auth email (and the public contact form when configured). |
| `EMAIL_TRANSPORT` | `smtp` selects SMTP delivery (local Mailpit). Leave unset for Resend. |
| `SMTP_HOST`, `SMTP_PORT` | SMTP endpoint for the `smtp` transport. Port 465 uses TLS. |
| `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `CONTACT_WEBHOOK_URL` | Public website contact-form delivery settings. They are separate from workspace auth email and must not be repurposed. |

### AI providers and worker

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables the OpenAI adapter. |
| `ANTHROPIC_API_KEY` | Enables the Anthropic adapter. |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Enables the Gemini adapter. |
| `AI_WORKER_HEALTH_PORT` | Worker health port, default `4319`, bound to loopback. |
| `AI_WORKER_HEALTH_URL` | URL the web app probes for worker health, default `http://127.0.0.1:4319/health`. |
| `AI_WORKER_HEALTH_TIMEOUT_MS` | Probe timeout, default `500` ms. |

Provider keys are read on the server only. They are never stored in the
database or returned to the browser, and provider metadata omits their names
beyond the "not configured" guidance. Do not enable a provider or spend money
without approved configuration.

### Tests

| Variable | Purpose |
| --- | --- |
| `PHASE2A_TEST_DATABASE_URL` | Disposable, migrated database for destructive fixtures. Required for database-backed suites; otherwise those suites are skipped. |
| `PHASE2A_TEST_ALLOW_REMOTE` | Only set to `1` to permit destructive fixtures against a non-loopback test database. |

---

## 4. Database driver rules

- Loopback hosts (`localhost`, `127.0.0.1`, `::1`) require `node-postgres`.
- Remote hosts default to `neon-http`. `DB_DRIVER` may set the driver explicitly.
- `neon-http` against a loopback host is rejected.
- `node-postgres` against a remote host is rejected outside production unless
  `ALLOW_REMOTE_DB=1`.
- The `node-postgres` pool is capped at 10 connections in this process.

The worker always uses a TCP connection (pg-boss), regardless of the web app's
driver.

---

## 5. Migrations

Schema source of truth: `src/db/schema.js`. Generated SQL, snapshots and the
journal live in `drizzle/`. Drizzle records applied migrations in its own
`__drizzle_migrations` table.

Procedure:

1. Edit `src/db/schema.js`.
2. `npm run db:generate` — review the new SQL, snapshot and journal entry.
   Migrations are additive by convention; keep them forward-only.
3. `npm run db:check` — verify journal/snapshot consistency.
4. Apply to the disposable test database and run the integration suite.
5. Apply to development with `npm run db:migrate:local`.
6. For any non-local environment, obtain explicit approval first, take a
   restore point, then run `npm run db:migrate` with `DATABASE_URL` supplied by
   the environment.

Rules:

- Do not use `drizzle-kit push` against shared databases; it is not part of the
  scripts and bypasses review.
- Never delete or rewrite an already-applied migration. Fix forward with a new
  migration.
- No resets, truncations or data cleanup against shared or production data.
- Verify applied migrations read-only (for example, list rows in
  `__drizzle_migrations`); do not modify that table by hand.
- After restoring an older backup, check the recorded migration version before
  starting the app or worker.

---

## 6. Tests and verification

| Command | Behaviour |
| --- | --- |
| `npm test` | Runs every `tests/*.test.mjs` with the alias loader. Does not load `.env.local`; database-backed suites skip when the test URL is unset. |
| `npm run test:integration` | Same suite, loading `.env.local` (including `PHASE2A_TEST_DATABASE_URL`) so database-backed suites execute. |
| `npm run lint` | ESLint. |
| `npm run build` | Production build. |

Test database requirements:

- It must be disposable and already migrated to the current schema.
- Its database name must end in `_test`; otherwise fixtures refuse to run.
- It must be loopback unless `PHASE2A_TEST_ALLOW_REMOTE=1` is deliberately set.
- Fixtures create and delete rows. Never point it at development or production
  data, and never place production credentials in a local env file.

Harness limits: tests run in plain Node, not the Next server runtime. Modules
that need `next/server` cannot be imported there. Request guards were moved to
`src/lib/http-guards.js` so same-origin, body-limit and error-sanitisation
behaviour can be tested without importing the Next runtime.

A check is only reported as passing when it was executed and its output was
inspected. Skipped, blocked and unrun checks must be labelled that way.

---

## 7. AI worker

Start:

```bash
npm run ai:worker
```

The script loads `.env.local`, connects with `DATABASE_URL`, registers the
`agent-run`, `research-prepare` and `website-audit` queues, and listens on
`http://127.0.0.1:4319/health`.

Stop: `Ctrl+C`, or send `SIGTERM` to the process. The worker logs "finishing
current job", stops pg-boss gracefully (up to 30 seconds), closes the database
and exits 0. It does not claim new jobs after shutdown starts.

Queue settings:

| Queue | Retries | Job expiry | Job payload retention |
| --- | --- | --- | --- |
| `agent-run` | 2 | 240 s | 24 h |
| `research-prepare` | 2 | 120 s | 24 h |
| `website-audit` | 1 | 300 s | 24 h |

Workers process one job at a time per queue (`batchSize: 1`). The health JSON
includes processed/failed counters and queued/ready/active/failed totals per
queue.

Provider requirements:

- A run that does not require approval is refused when the selected provider has
  no API key; nothing is queued and no provider call is attempted.
- An approval-required run can wait for approval without a key, but cannot
  execute until the provider is configured.
- The app reports `aiExecution: not_configured` and
  `checks.aiProviders: not_configured` until at least one key is present.
- Do not add keys, enable providers or consume paid credits without approval.

Deployment note: the health endpoint binds to loopback. If the web app and
worker run on different hosts or containers, set `AI_WORKER_HEALTH_URL` to an
address the web app can reach and adjust the timeout. The worker must be able to
open a TCP connection to PostgreSQL. If a connection pooler is used, verify
pg-boss compatibility or give the worker a direct connection string.

---

## 8. Queue troubleshooting

| Symptom | Checks |
| --- | --- |
| App says "AI execution is not configured" | No provider key is set, or all configured providers are disabled in workspace AI settings. Provider health shows `not_configured`. |
| Health shows `aiWorker: not_running` | Worker is not running, is on another host, or the health URL/port is wrong. Start it and check `http://127.0.0.1:4319/health`. |
| Health shows `aiWorker: unhealthy` | Worker responded but reported `ok: false` (shutting down) or a non-OK status. Read worker logs. |
| Jobs stay queued | Check queue counts and worker registration logs; confirm both app and worker reach the same database. |
| Run failed after retries | Open the run detail. Attempts, status and the provider error message are stored on the run; logs add `[ai-worker ...]` context. Fix the cause (key, model, limits) and create a new run. |
| Queue unavailable at creation | The app returns a failed run with "The background queue is unavailable. Start the AI worker and try again." and records an `agent_run.failed` audit entry with reason `queue_unavailable`. |
| Port 4319 already in use | Stop the other process or change `AI_WORKER_HEALTH_PORT` and `AI_WORKER_HEALTH_URL` together. |

Operational details:

- Retries are automatic with backoff; there is no manual requeue endpoint.
  Cancel a stuck run through the run's cancel action (permission-checked), fix
  the cause, then start a new run.
- Duplicate creation is avoided with an optional idempotency key; a repeated
  request returns the existing run with `reused: true`.
- pg-boss manages its own tables in schema `pgboss`. Do not edit them by hand.
  Expired jobs are removed after the retention window.
- Worker logs are prefixed `[ai-worker <timestamp>]`; queue connection errors are
  prefixed `[ai-queue]`.

---

## 9. Logging and audit review

Log prefixes:

- `[workforce-api]` — unexpected API errors. Only the error name is logged;
  responses use a generic message and never include database text or secrets.
- `[ai-worker ...]` — worker lifecycle, job outcomes and retryable failures.
- `[ai-queue]` — pg-boss connection errors.
- `[email]` — email delivery failures (provider errors only).

Audit review:

- Open `/workspace/audit` (requires `audit.view`; owner and admin have it).
- Rows show timestamp, actor, formatted action, resource type, success and
  safe metadata. Labels cover auth, membership, workspace, CRM, proposal,
  project, client, finance, knowledge, memory and AI actions.
- Metadata is sanitised before storage: keys matching
  `/pass|token|secret|key|auth|cookie|session|credential/i` are dropped,
  strings are clipped to 300 characters, nesting stops after depth 3, arrays
  are capped at 20 entries.
- Audit writes are best-effort and never fail the primary operation. A refused
  operation does not create a phantom success row.
- There is no automated audit retention, archival or export in this phase.
  Define a retention policy before production if auditors require one.
- The health endpoint exposes readiness labels and queue counts, not secrets.

---

## 10. Backup and restore (documented only)

Nothing in this section was executed during Phase 2F. Production backup,
restore and point-in-time recovery require explicit approval.

Production (Neon):

- Take or confirm a restore point before any migration.
- Prefer Neon point-in-time recovery or a branch for restore validation.
- Restore into a non-production branch first and verify schema version, row
  counts and application smoke tests before touching production.
- Stop the worker before restoring business data so in-flight jobs are not
  processed against a changing database.

Local PostgreSQL (examples only; never run against production without approval):

```bash
pg_dump "$DATABASE_URL" --format=custom --file="mk_workforce_backup_$(date +%Y%m%d).dump"
```

Restore only into a disposable database, for example a database whose name ends
in `_test`, and verify before use. `pg_restore` with clean/overwrite options is
destructive.

Backups include application tables, auth tables and the `pgboss` schema. After
restoring:

1. Check the recorded migration version; apply pending migrations only if the
   backup predates the code.
2. Start the app, check `/api/workforce/health`.
3. Sign in, load the overview, finance and audit pages, and confirm recent
   records and audit entries are present.
4. Start the worker and confirm queue counts and health.

No scheduled backup job exists in this repository; rely on the database
provider's backup configuration.

---

## 11. Performance review (Phase 2F)

Findings from code review and a light local measurement pass. Timings are from
the Turbopack development server against the local database with QA data; they
are indicative, not production benchmarks.

| Page | TTFB | First contentful paint | DOM content loaded |
| --- | --- | --- | --- |
| `/workspace` (overview) | 190 ms | 340 ms | 493 ms |
| `/workspace/finance` | 389 ms | 548 ms | 462 ms |
| `/workspace/projects` | 386 ms | 580 ms | 483 ms |
| `/workspace/memory/memories` | 145 ms | 344 ms | 242 ms |

Structural observations:

- Every module table has workspace-scoped indexes for status, created date and
  its main foreign keys (client, project, owner, due date). Finance and queue
  hot paths are covered.
- Knowledge search uses PostgreSQL core full-text search with GIN indexes on
  entries and chunks, with escaped `ILIKE` fallback for short queries.
- List endpoints are paginated with validated caps: default 20, maximum 100
  for most modules and 50 for AI runs, research and website audits.
- The dashboard composes nine module overviews in parallel. Each overview uses
  grouped aggregates and a small recent list, but a dashboard load still issues
  several dozen bounded queries. This is acceptable at current scale and should
  be watched as workspaces grow.
- The finance overview runs ten grouped aggregate queries in parallel plus
  recent invoices and payments; list helpers that assemble receivables and
  payables cap at 500 rows. Multi-currency data is grouped per currency with
  INR as the primary display currency; there is no FX conversion.
- AI context is bounded: at most 6 knowledge entries, 8 chunks, 6 memories and
  4 entity records, with a 9,000-character total budget per run.
- The worker processes one job at a time per queue. Raising concurrency affects
  provider rate limits, database pool usage and cost.
- The AI worker batch size and the in-memory rate limiter are per process; there
  is no shared rate-limit store.

Recommendations (not implemented in 2F):

- Add database query monitoring or APM only with approval and a provider
  decision; none was added.
- If dashboard latency grows, cache or materialise module summaries, or split
  the overview into lazily loaded sections.
- Review `EXPLAIN` plans for finance and knowledge queries once real data
  volumes exist.
- Keep document uploads within the enforced limits (1 MB file, 512 KB decoded
  text, 400 chunks, 200,000 stored characters).

---

## 12. Pre-deployment checklist

- [ ] Explicit approval obtained for the deployment, migration and environment
      changes.
- [ ] Backup or restore point confirmed before applying migrations.
- [ ] `DATABASE_URL` points at the intended production endpoint; `DB_DRIVER`
      matches (remote uses `neon-http`).
- [ ] `AUTH_SECRET` is unique to the environment and not reused elsewhere.
- [ ] `AUTH_URL` exactly matches the deployed workspace origin and uses HTTPS.
- [ ] `AUTH_EMAIL_FROM` is a verified sender; `RESEND_API_KEY` is present for
      workspace auth email.
- [ ] `WORKSPACE_OWNER_EMAIL` is correct for first sign-in.
- [ ] AI provider keys are present only if approved and intended; otherwise the
      app must clearly report AI execution as not configured.
- [ ] `npm run db:check`, `npm test`, `npm run test:integration`, `npm run lint`
      and `npm run build` have run and their results were inspected.
- [ ] Pending migrations were reviewed and applied through the documented
      procedure.
- [ ] Worker is deployed with access to PostgreSQL; health URL is reachable from
      the web app; queue counts are visible.
- [ ] Smoke test completed: sign-in, overview, one create flow, one list view,
      audit row, health endpoint.
- [ ] Public website remains unchanged.
- [ ] Rollback owner and previous build are identified.

---

## 13. Rollback

1. Stop starting new work: pause the worker and avoid migrations during the
   rollback window.
2. Redeploy the previous known-good build. Application rollback does not
   automatically revert database migrations.
3. Migrations are additive and forward-only. Prefer a forward fix. Do not
   hand-edit or drop columns/tables in production.
4. If a destructive data rollback is unavoidable, restore from the approved
   restore point or backup, then verify the migration version and run smoke
   tests. This requires explicit approval and is not a routine step.
5. If credential exposure is suspected, rotate the affected secret in the
   environment and invalidate sessions as appropriate.
6. After rollback, confirm `/api/workforce/health`, worker health, queue counts,
   sign-in and the audit log.

---

## 14. Known limitations

- No automated responsive or mobile browser suite. Phase 2F browser QA was
  performed manually at a desktop viewport; mobile layout was not exercised by
  tooling.
- Rate limiting is in-memory per application instance; it is not coordinated
  across serverless instances.
- The dashboard aggregates every permitted module on each load. It is bounded
  but not cached.
- The AI worker is a single process per deployment with no autoscaling or
  high-availability support in this repository. It must be supervised externally.
- Worker health is probed over loopback by default; split-host deployments must
  configure `AI_WORKER_HEALTH_URL`.
- Knowledge retrieval is lexical (PostgreSQL full-text and `ILIKE`); there are
  no embeddings, vector search or external search services.
- Document ingestion accepts plain text, markdown, CSV and JSON only. PDF and
  DOCX are rejected rather than partially parsed.
- No automated audit retention, archival or export.
- No scheduled backup job or restore automation in this repository.
- Multi-currency finance data is grouped per currency without FX conversion.
- Real AI provider execution was not exercised in Phase 2F because no provider
  keys were configured; runtime and queue behaviour were verified without
  external calls.
- `next build` and the full regression suite are re-run in the final acceptance
  stage; any check not executed is marked NOT RUN in the Phase 2F report.
