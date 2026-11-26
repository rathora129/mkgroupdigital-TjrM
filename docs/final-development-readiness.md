# Final Development Readiness

Status: local development closure for Phases 2A–2H.
This document records what exists, what was verified locally, and what is
required before any production use. It is not a production-readiness claim.

Local verification baseline for this close-out:

- Unit suite: 219 tests, 125 pass, 94 skipped (DB-gated), 0 fail.
- Integration suite (disposable test DB): 219 tests, 219 pass, 0 fail.
- Lint: clean. Production build: compiled, 31/31 static pages.
- Migration state: 11 migrations applied in both local dev and local test DBs.
- Browser QA: 32 routes × 3 viewports = 96 checks, 0 layout overflow,
  0 console errors.

## 1. Architecture summary

- Next.js 16.4.5 App Router, React 19.3.1, JavaScript/JSX only.
- Authenticated workspace under `src/app/workspace/(dashboard)` with
  server-side permission gates (`requirePermissionPage`, `requirePermission`).
- API routes under `src/app/api`, JSON envelope `{ok,data}` /
  `{ok:false,error:{code,message,details}}`, yup validation, same-origin
  assertion on mutating routes, 32 KB JSON body limit.
- PostgreSQL (Neon-compatible, local Postgres in development) through Drizzle
  with a dual driver (node-postgres local, serverless remote) and a remote-DB
  guard (`ALLOW_REMOTE_DB`).
- pg-boss queues in the existing database (`pgboss` schema); worker process
  `scripts/ai-worker.mjs`; health probe on `AI_WORKER_HEALTH_PORT` (default
  4319).
- Domain services: clients, projects/tasks, billing, knowledge/memory, AI
  runtime, marketing, integrations/execution/automation, audit, email.

## 2. Phase 2A–2G status

| Phase | Scope | Status |
| --- | --- | --- |
| 2A | Auth, workspaces, membership, roles, audit, settings | Implemented, verified locally |
| 2B | AI agents, runs, approvals, provider abstraction, worker | Implemented, verified locally |
| 2C | Leads, business research, website audits (SSRF-guarded) | Implemented, verified locally |
| 2D | Opportunities, proposals, projects, clients, billing | Implemented, verified locally |
| 2E | Knowledge base, document ingestion, AI memory | Implemented, verified locally |
| 2F | Reliability, isolation, security and UX hardening | Implemented, verified locally |
| 2G | Marketing profiles, audits/SEO, campaigns, content, website execution, reports | Implemented, verified locally |

No Phase 2A–2G module was recreated or replaced during 2H; 2H extends them.

## 3. Phase 2H summary

- 2H-A: Integration capability audit recorded in the registry (16 providers
  across 11 kinds). No second registry was created; AI and email entries point
  at the existing Phase 2A/2B systems.
- 2H-B: Integration framework: `integrations` table, service, registry,
  env-presence readiness, connect/disconnect states, audit. Credentials are
  never read into responses; only environment key names are exposed.
- 2H-C: Adapter contracts (`src/lib/integrations/adapters.js`) for CMS,
  analytics, Search Console, Google/Meta Ads, social, email and lead sources,
  plus a deterministic labelled mock adapter. Ads planning forces actual spend
  to zero; social/email contracts force `externalPublishing`/`externalSending`
  to false. Live adapters refuse with `LIVE_INTEGRATION_DISABLED`.
- 2H-D: Webhook framework: HMAC-SHA256 signature over `timestamp.body`,
  300 s skew window, 64 KB body cap, provider allowlist, per-IP rate limit,
  idempotency key in a unique constraint, retry budget, sync-event history,
  audit. Payloads are validated and never trusted; leads are never created
  automatically.
- 2H-E: Approval-gated execution lifecycle
  (`proposed → awaiting_approval → approved|rejected → queued → executing →
  completed|failed|cancelled`). Approval and execution are separate decisions
  and separate permissions. Rejected and cancelled requests never execute.
  Re-execution is idempotent. External categories require a configured
  integration or fail with `INTEGRATION_REQUIRED`.
- 2H-F: Nine workflow definitions on the existing pg-boss worker
  (`workflow-run` queue), each read-only: onboarding checklist, audit
  follow-up, SEO task check, content approval reminder, report preparation,
  website improvement review, pending approval reminder, failed integration
  notification, project progress summary. Bounded retries
  (`WORKFLOW_JOB_MAX_ATTEMPTS = 2`), cancellation, per-step records, audit.
- 2H-G: UI: Integrations, Executions, Automations, Monitoring pages plus
  Operations tab navigation, all server-gated; monitoring reads queue depth,
  worker health, approvals, recent executions and automation runs.
- 2H-H: One DB-backed end-to-end test covers the 20-step local workflow
  (client → marketing → audit → SEO task → campaign → AI content (labelled
  manual/mock path) → review → website proposal → approval → execution →
  mock execution with evidence → report → automation → worker retry semantics
  → audit history → isolation/RBAC denial).

### Defects found and fixed during final closure

1. `src/lib/automation/service.js`: open-task SQL used the invalid enum literal
   `'done'` (the enum is `completed`), breaking every workflow that reads
   project tasks. Fixed to `not in ('completed','cancelled')`.
2. `src/lib/integrations/webhooks.js`: duplicate detection checked
   `error.code`, but Drizzle wraps the pg error so `23505` lives on
   `error.cause`. Duplicate deliveries would have thrown 500 instead of being
   recorded as duplicates. Fixed by reusing `isUniqueViolation`.
3. `src/lib/integrations/webhooks.js`: the inbound lead validator received a
   double-wrapped object, so every inbound lead event failed processing. Fixed
   to pass `payload.data` directly.
4. `src/lib/integrations/service.js`: `toView` dereferenced a null row for any
   registry provider without a stored row, crashing the integrations list.
   Fixed to fall back to registry metadata.
5. Responsive defects: tables inside flex cards expanded the page at ≤390 px on
   Overview, Finance, Memory, Integrations and Monitoring. Fixed with
   `min-width: 0` on `Card`/`TableWrap`/overview `Panel` and a scroll wrapper
   around the overview run table.
6. Stale phase labels in the shell, overview, system status and health route
   now read "2H · Integration & Automation".

## 4. Integration inventory

Legend: "Env-only" = configured when the listed names exist; "Future" = contract
only, no live calls; "Builtin" = no credentials required.

| Kind | Provider | Purpose | Read/Write | Approval | Connection |
| --- | --- | --- | --- | --- | --- |
| AI provider | openai | Agent and content generation | read | no | Env-only (`OPENAI_API_KEY`) |
| AI provider | anthropic | Agent generation | read | no | Env-only (`ANTHROPIC_API_KEY`) |
| AI provider | gemini | Agent generation | read | no | Env-only (`GEMINI_API_KEY` or `GOOGLE_API_KEY`) |
| Email | resend | Existing transactional email | send_message | yes | Env-only (`RESEND_API_KEY`, `AUTH_EMAIL_FROM`) |
| Email | smtp | Local Mailpit transport | send_message | yes | Env-only (`EMAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `AUTH_EMAIL_FROM`) |
| CMS | wordpress_rest | Page update proposals, publishing requests | read-only contract | yes | Future |
| CMS | generic_http | Custom/headless CMS contract | read-only contract | yes | Future |
| Analytics | google_analytics_ga4 | Metric import with source/time | read-only contract | no | Future |
| Search Console | google_search_console | Queries/impressions/clicks/position | read-only contract | no | Future |
| Ads | google_ads | Planning and reporting, zero spend | read-only contract | yes | Future |
| Ads | meta_ads | Planning and reporting, zero spend | read-only contract | yes | Future |
| Social | instagram_graph | Account/content publishing contract | read-only contract | yes | Future |
| Social | linkedin | Account/content publishing contract | read-only contract | yes | Future |
| Lead source | inbound_hmac | Signature-verified inbound events | receive only | no | Env-only (`INTEGRATION_WEBHOOK_SECRET`) |
| File storage | local_document_store | Existing knowledge document store | store/read | no | Builtin |
| Webhook | generic_hmac | Signed inbound webhook + sync history | receive only | no | Env-only (`INTEGRATION_WEBHOOK_SECRET`) |

Live publishing, advertising, social posting and customer messaging are
disabled for every provider in this phase.

## 5. Automation and approval lifecycle

Execution request fields: workspace, client, project, category, operation,
target system, payload reference, risk level (`low|medium|high|critical`),
required permission, status, requester, approver, execution timestamp,
result/evidence, failure reason.

Rules enforced in service code and tests:

- Approval never marks execution complete; execution is a separate permission
  and a separate transition.
- `rejected` and `cancelled` are terminal and are never queued or executed.
- Duplicate execution requests return the existing completed result.
- High/critical risk cannot be self-approved; medium risk cannot be
  self-approved either under current policy.
- External categories (`website_publish`, `website_content`, `social_publish`,
  `email_send`, `ads_budget`, `ads_pause`, `data_import`) require a configured
  integration; otherwise the request is rejected with `INTEGRATION_REQUIRED`.
- Only `internal_record` is executable today, through the labelled mock adapter
  whose evidence is `mock-adapter:<kind>:<digest>`.
- Every transition writes an audit entry (`execution.create/submit/approve/
  reject/execute/complete/fail/cancel`).

Workflows are read-only summaries; they cannot publish, message, spend or skip
an approval. Cancelled runs are skipped by the worker; unexpected failures
retry once more (`WORKFLOW_JOB_MAX_ATTEMPTS = 2`) and then settle as failed.

## 6. AI runtime readiness

- Provider abstraction exists with env-based readiness; no provider is
  configured in the local environment, so agent runs are unavailable rather
  than faked.
- Agent runs are queued on `agent-run` and executed by the same worker; retries
  are bounded (`AI_JOB_MAX_ATTEMPTS = 3`).
- Content generation paths that need an AI provider fall back to manual entry
  and every generated item is labelled; nothing is presented as AI output when
  no provider ran.
- Knowledge/memory context is permission-filtered and bounded; the runtime is
  instructed to state when context is insufficient.

## 7. Worker readiness

- `scripts/ai-worker.mjs` registers `agent-run`, `research-prepare`,
  `website-audit`, `integration-event`, `execution-request`, `workflow-run`.
- Health endpoint on `AI_WORKER_HEALTH_PORT` (default 4319) reports
  `running|not_running|unhealthy` with startedAt/processed/failed.
- Monitoring UI shows worker health honestly ("Not running" locally) and queue
  depth for all six queues.
- Tests exercise job handlers directly with injected queue stubs, so worker
  logic is verified without a live pg-boss instance; queue lifecycle behaviour
  (skip settled/cancelled, retry budgets) is covered by the Phase 2F worker
  tests and the 2H end-to-end test.

## 8. Database and migration inventory

Migrations are tracked in `drizzle.__drizzle_migrations`. Local dev and local
test databases each report 11 applied migrations and 79 public tables.

| Migration | Content |
| --- | --- |
| 0000_safe_revanche | Users, workspaces, memberships, invitations, verification tokens, audit logs |
| 0001_superb_thunderbolt_ross | Role/settings additions |
| 0002_neat_wiccan | Agents, runs, logs, provider settings, approvals |
| 0003_cold_chamber | Leads, research jobs/findings, website audits |
| 0004_heavy_runaways | Opportunities, services catalogue |
| 0005_handy_cardiac | Proposals, versions, sections, approvals, activity |
| 0006_lazy_zzzax | Clients, engagements, projects, tasks, milestones, billing, support |
| 0007_strange_wonder_man | Knowledge entries/chunks/documents, AI memories |
| 0008_adorable_lady_deathstrike | Marketing profiles, campaigns, content, metrics, reports, website proposals |
| 0009_big_ben_urich | Marketing content review/publish columns (additive) |
| 0010_lucky_hulk | Integration, execution, webhook and automation tables (additive) |

- Journal indices 0–10 are contiguous and unique; `drizzle-kit check` passes.
- 0005–0010 contain no `DROP`, `TRUNCATE`, destructive `DELETE`, type rewrites
  or renames; only additive tables, columns, enums, foreign keys and indexes.
- No duplicate index names across 0005–0010.
- 0010 is applied to both local databases only; nothing was applied remotely.

## 9. Environment configuration inventory (names only)

Never commit these values. Required by the application:

`AUTH_SECRET`, `AUTH_URL`, `AUTH_EMAIL_FROM`, `DATABASE_URL`, `DB_DRIVER`,
`WORKSPACE_OWNER_EMAIL`, `SESSION_MAX_AGE_SECONDS`, `ALLOW_REMOTE_DB`,
`PHASE2A_TEST_ALLOW_REMOTE`, `PHASE2A_TEST_DATABASE_URL`.

Email: `EMAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `RESEND_API_KEY`.
Optional public-site form: `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`,
`CONTACT_WEBHOOK_URL`.

Worker: `AI_WORKER_HEALTH_PORT`, `AI_WORKER_HEALTH_URL`,
`AI_WORKER_HEALTH_TIMEOUT_MS`.

AI providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`GOOGLE_API_KEY`.

Integrations (all optional; absence means NOT_CONFIGURED):
`INTEGRATION_WEBHOOK_SECRET`, `WORDPRESS_API_URL`, `WORDPRESS_API_TOKEN`,
`CMS_API_BASE_URL`, `CMS_API_TOKEN`, `GA4_PROPERTY_ID`,
`GA4_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`, `GSC_SERVICE_ACCOUNT_JSON`,
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`,
`GOOGLE_ADS_SERVICE_ACCOUNT_JSON`, `META_ADS_APP_ID`, `META_ADS_APP_SECRET`,
`META_ADS_ACCESS_TOKEN`, `META_ADS_AD_ACCOUNT_ID`, `META_GRAPH_APP_ID`,
`META_GRAPH_APP_SECRET`, `META_GRAPH_ACCESS_TOKEN`, `LINKEDIN_CLIENT_ID`,
`LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`.

## 10. RBAC and security verification

2H permissions by role (verified programmatically):

| Role | integrations.view | integrations.manage | executions.view | executions.request | executions.approve | executions.execute | automations.view | automations.manage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| owner | yes | yes | yes | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | yes | yes | yes | yes | yes |
| manager | yes | yes | yes | yes | yes | yes | yes | yes |
| member | yes | – | yes | yes | – | – | yes | – |
| specialist | yes | – | yes | yes | – | – | yes | – |
| viewer | yes | – | yes | – | – | – | yes | – |

Live HTTP checks against the production build:

- `GET /api/workforce/integrations`, `/executions`, `/automations`,
  `/operations/overview` without a session → `401 UNAUTHENTICATED`.
- Cross-origin `POST /api/workforce/executions` → `403 INVALID_ORIGIN`.
- Webhook without `INTEGRATION_WEBHOOK_SECRET` → `503
  INTEGRATION_NOT_CONFIGURED` (honest, not a fake success).

Covered by the DB integration test: member cannot execute; viewer cannot
request; rejected/cancelled never execute; approvals and executions are
separate permissions; cross-workspace reads return `NOT_FOUND`; every
transition is audited; webhook bad signature → `INVALID_SIGNATURE`; duplicate
webhook → `duplicate: true` with no second event; inbound events never create
leads automatically.

Not weakened: no security control was relaxed to make tests pass.

## 11. Responsive QA results

Method: production build served locally on the port declared by `AUTH_URL`
(`http://localhost:3000`), Chrome 157 headless driven over CDP with real
magic-link sign-in. Viewports: desktop 1440×900, tablet 834×1112, mobile
390×844. Device-metrics emulation was used; no physical device was tested.

Coverage: 32 routes (login, overview, AI workforce, leads, opportunities,
services, proposals, research, website audits, approvals, audit log, settings,
projects, tasks, clients, engagements, support, finance, memory, knowledge,
memories, marketing overview/clients/campaigns/content/calendar/website/SEO
audits/reports, integrations, executions, automations, monitoring).

Results: 96/96 checks rendered with workspace navigation and a page heading,
0 console errors, 0 horizontal document overflow after the fixes in section 3.
Tables at narrow widths scroll inside their bordered wrapper by design.
Screenshots of Overview, Integrations, Executions, Automations, Monitoring and
Marketing reports were reviewed at all three widths and look correct
(stats stack, tabs wrap, cards single-column, hamburger navigation present).

Known QA limitation: `AUTH_URL` points at `localhost:3000`, so the magic-link
callback is built for that port; the QA server must run there. When already
signed in, `/workspace/login` redirects to `/workspace`, which is expected.

## 12. Test commands and exact results

```
npm test
  -> 219 tests, 125 pass, 94 skipped (DB-gated), 0 fail

npm run test:integration
  -> 219 tests, 219 pass, 0 fail (includes phase2h-integration.test.mjs, all 20 steps)

npm run lint
  -> clean

npm run build
  -> compiled successfully; 31/31 static pages; all workspace routes dynamic

npm run db:check
  -> "Everything's fine"

npx next start -p <port>
  -> ready; GET /workspace 307 -> /workspace/login 200
```

Comparison to the 2G baseline: unit pass moved 113 → 125 (+12 Phase 2H unit
tests); DB-gated skips moved 93 → 94 (+1 Phase 2H end-to-end test); integration
moved 206 → 219 (+13). All additions are new Phase 2H coverage; no prior test
was removed or skipped to reach these numbers. The three defects in section 3
were surfaced by the new tests and fixed rather than excluded.

## 13. Known limitations

- No external integration is connected: CMS, analytics, Search Console, ads,
  social, and real email delivery are contracts only. "Configured" reflects
  environment key presence, not a live handshake.
- Only `internal_record` executions can run, through the labelled mock adapter.
- The AI worker is not running by default locally; run `npm run ai:worker` to
  process queues. Monitoring will show "Not running" until then.
- No AI provider key is present locally; agent/content generation is
  unavailable and manual paths are labelled accordingly.
- No automated responsive regression suite is committed; the CDP QA harness
  used here lives in a temporary directory.
- No load, soak or concurrency testing was performed.

## 14. Production preparation checklist (manual, requires owner approval)

1. Provision the production PostgreSQL/Neon database and set `DATABASE_URL`,
   `DB_DRIVER`, and the remote-DB guard flags deliberately.
2. Set `AUTH_SECRET`, `AUTH_URL` (production origin), `AUTH_EMAIL_FROM` and
   the production email transport credentials.
3. Back up the production database, then apply migrations 0000–0010 in order
   with `npm run db:migrate` (verify the journal before applying).
4. Deploy the worker process (`npm run ai:worker`) with its health port/URL and
   confirm `running` in Monitoring.
5. Set `INTEGRATION_WEBHOOK_SECRET` before exposing the webhook endpoint.
6. Configure AI provider keys only if agent execution is desired.
7. Configure a real integration only after review; until then its status must
   stay NOT_CONFIGURED.
8. Verify RBAC with real accounts for each role; verify workspace isolation.
9. Repeat the browser QA on the deployed origin and on a real device.

## 15. Rollback considerations

- Migrations 0005–0010 are additive; rolling back the application does not
  require dropping tables. Leaving 0010 in place is safe for an older build
  because nothing else references those tables.
- Rolling back the worker is independent of the web process; queued jobs remain
  in pg-boss and can be drained or left to expire per queue policy.
- No destructive DDL was introduced, so there is no schema rollback script and
  none is needed for a code-only rollback.
- Database backups remain the only recovery path for data loss; none was
  created or required locally because no destructive operation ran.

## 16. Outstanding blockers

- Production database has not been migrated (0010 unapplied remotely).
- No production credentials or external accounts are configured, by design.
- Worker deployment and health verification remain to be done per environment.
- Live publishing, advertising and customer messaging stay disabled until a
  future phase explicitly enables them with authorization and approval.
- Local build and tests passing does not make the system production-ready; the
  checklist in section 14 must be completed deliberately.
