# MK AI Workforce — Phase 2 Architecture Plan

**Status:** Proposal for review. Nothing in this document is implemented.
**Date:** 2026-11-22
**Scope:** Architecture only — no packages installed, no source files changed, no databases created, no environment variables added.

This document separates **confirmed** facts about the current repository from **proposed** Phase 2 decisions. Anything marked *proposed* requires explicit approval before implementation.

---

## 1. Confirmed baseline

| Area | Confirmed state |
| --- | --- |
| Framework | Next.js 16.4.5 (App Router), React 19.3.1, JavaScript/JSX only |
| Styling | styled-components 6 with a dark public theme; isolated light workspace theme under `.workspace-root` |
| Libraries | framer-motion, formik, yup, lucide-react. No TypeScript |
| Public site | Full MK Group Digital website; dark theme, Header/Footer/WhatsApp, SEO/metadata, sitemap |
| Public API | `POST /api/contact` (Yup validation, Resend or webhook delivery, 503 fallback). Env names: `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `CONTACT_WEBHOOK_URL` (names only; no values in this repo) |
| Workspace | Phase 1 shell at `/workspace` with 11 routes, sidebar/topbar/drawer, light theme, 404/error boundaries, `GET /api/workforce/health` |
| Data layer | **None.** All content is static files under `src/data/` |
| Database | **None** configured or assumed |
| Auth | **None** implemented. `/workspace` is currently unauthenticated and marked `noindex` |
| Background jobs | **None** |
| AI providers | **None** integrated |
| Hosting/deployment | **Not confirmed.** No `vercel.json`, Dockerfile, or CI configuration in the repository |
| Environment files | Only `.env.example` (contact delivery names). No `.env`/`.env.local` present in the repo |
| Git state | Phase 1 work is present as uncommitted changes on `main` |

### Confirmed reusable assets

- Design tokens and component patterns from Phase 1 (`src/styles/workspaceTheme.js`, shell components).
- Existing service/pricing/industry content in `src/data/` for seeding a future service catalog.
- Existing Yup validation conventions (`src/lib/contactSchema.js`).
- Existing security headers in `next.config.mjs` (`nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`).

---

## 2. Proposed system architecture

### 2.1 Logical architecture

```
Browser (public site + /workspace)
        │  HTTPS, HTTP-only session cookie
        ▼
Next.js application (single deployment)
  ├─ Public routes (unchanged)
  ├─ /workspace UI (light shell)
  └─ /api/workforce/* (session + role + CSRF + validation)
        │                         │
        │ SQL (Drizzle)           │ enqueue jobs (pg-boss)
        ▼                         ▼
PostgreSQL (Neon or equivalent)   Worker process (Node.js)
  ├─ business tables                ├─ job consumers
  ├─ agent runs + events            ├─ agent orchestrator
  ├─ pgvector embeddings            ├─ tool executor
  ├─ job queue tables               └─ provider adapters
  ├─ usage + audit logs
  └─ Auth.js tables
        │
        ├─ Object storage (S3-compatible/R2): audit artifacts, reports, uploads
        ├─ LLM providers (OpenAI/Anthropic/Google) via internal abstraction
        └─ External APIs: PageSpeed Insights, email delivery, website fetches
```

### 2.2 Core architectural principles

1. **The browser never talks to an LLM or database directly.** All privileged work happens server-side.
2. **Every agent action is a persisted run + step**, not an in-memory chain. Runs are resumable after crashes and pause at approvals.
3. **Tool results are the source of truth for facts** (SEO checks, performance metrics, pricing). LLMs summarize and draft; they do not invent metrics or send external messages.
4. **Humans gate irreversible or external actions** (email send, proposal send, sensitive memory writes, destructive changes, spend above threshold).
5. **Workspace scoping on every row** (`workspace_id`) plus application-level checks; Postgres RLS as defense in depth.
6. **Vendor swap-out points**: provider adapter, object storage adapter, queue adapter. No framework-specific agent DSL in business logic.

### 2.3 Proposed runtime topology

Two viable topologies. Recommendation depends on the hosting decision (Section 16).

**Option A — Container host (recommended for Phase 2)**

- One managed Node.js service running Next.js (`next start`).
- One background worker service (same image, different command).
- Managed PostgreSQL (Neon or provider-managed) with pgvector.
- Object storage bucket.
- Cron schedules dispatched by the worker's scheduler (pg-boss), not platform cron.

Why: durable long-running jobs, no serverless timeout ceiling, predictable cost, one language/runtime.

**Option B — Serverless**

- Next.js on Vercel (or equivalent), database on Neon, jobs on Inngest/Trigger.dev, object storage on R2.
- Works, but long audits and multi-step agents must run as managed workflow steps with their own limits and billing.

**Not recommended for Phase 2:** self-managed VPS. Lowest cost but highest operational risk for a security-sensitive, data-holding system.

---

## 3. Frontend / backend responsibilities

### 3.1 Frontend (App Router)

| Responsibility | Detail |
| --- | --- |
| Workspace UI | Server components for data reads; client components only for interactivity (drawer, forms, optimistic updates) |
| Auth screens | `/workspace/sign-in`, `/workspace/sign-in/verify` (magic link), optional SSO button |
| Data fetching | Server-side reads through a session-scoped data layer; no direct DB calls from client components |
| Mutations | Call typed API routes; show explicit pending/error states; no fake success |
| Streaming | Agent run progress via SSE from `/api/workforce/runs/:id/events` (session-authenticated) |
| Approvals | Rich preview of pending action (email draft, proposal, memory write) with diff/evidence |
| Usage visibility | Real metered values only; “No data” empty states until events exist |

### 3.2 Backend

| Responsibility | Detail |
| --- | --- |
| Session enforcement | Auth.js session check in middleware and again in the workspace layout and every API route |
| Authorization | Role/permission checks per endpoint and per agent tool |
| Validation | Yup schemas for request bodies (reuse existing validation style) |
| Orchestration | Run creation, planning, step execution, approval pauses, retries |
| Tool execution | Controlled server-side tools only (fetch, audit, email, DB writes) with SSRF and size limits |
| Metering | Token/cost accounting on every provider call |
| Audit logging | Append-only records for security and business-relevant events |
| Health | Coarse public health; detailed diagnostics only for admins |

### 3.3 Proposed API surface (all under session auth unless noted)

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/workforce/health` | Coarse public status (existing; keep minimal) |
| GET | `/api/workforce/health/deep` | Admin-only: DB, queue, provider reachability (no secrets) |
| POST | `/api/workforce/leads` | Create/import a lead |
| GET | `/api/workforce/leads` | List/filter leads |
| POST | `/api/workforce/leads/:id/research` | Enqueue lead research run |
| POST | `/api/workforce/audits` | Request a website audit |
| GET | `/api/workforce/audits/:id` | Audit status + findings |
| POST | `/api/workforce/proposals` | Draft a proposal |
| POST | `/api/workforce/proposals/:id/send` | Request approval to send (never sends directly) |
| GET/POST | `/api/workforce/approvals` | Queue and decisions |
| GET | `/api/workforce/runs/:id` | Run state |
| GET | `/api/workforce/runs/:id/events` | SSE progress stream |
| GET | `/api/workforce/usage` | Metered usage and costs |
| POST | `/api/workforce/knowledge` | Create/index knowledge sources |
| POST | `/api/workforce/settings` | Workspace settings (admin only) |
| POST | `/api/webhooks/*` | Signed inbound webhooks only |

Naming and exact shapes are illustrative until Phase 2A design approval.

---

## 4. Database recommendation

### 4.1 Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **PostgreSQL + pgvector** (Neon, Supabase, RDS) | Relational integrity, JSONB, full-text search, vectors in one store, row-level security, standard SQL, easy backups | Requires one managed service; pgvector index tuning | **Recommended** |
| SQLite/Turso | Simple, cheap | Weak concurrent workers, limited RLS, vector support immature for this use | No |
| MongoDB | Flexible documents | Weak relational modeling for approvals/projects/costs, cross-doc transactions | No |
| MySQL + external vector DB | Mature | Two stores to secure/back up, weak vector integration | No |
| Supabase all-in-one | Auth + DB + storage + vectors in one vendor | Vendor coupling; pricing at scale | Viable alternative if speed matters more than portability |
| Neon + separate auth/storage | Clean separation, serverless-friendly, branching for staging, pgvector | Multiple vendors to manage | **Recommended** |

**Proposed choice: PostgreSQL (Neon) + Drizzle ORM + pgvector.**

Reasoning:

- One durable store for business data, agent state, jobs, memory vectors, usage and audit logs.
- JSONB covers evolving agent payloads without schema churn.
- Postgres advisory locks/`SKIP LOCKED` support a reliable queue in early phases.
- Neon offers branching (safe staging/preview data) and point-in-time restore.
- Drizzle is JavaScript-first, SQL-transparent, lightweight at runtime, and works well in server components and workers.
- If the team already has a managed Postgres instance for other projects, reuse it with a dedicated database and role instead of provisioning a second cluster (confirm first).

### 4.2 Proposed schema groups

All business tables carry `workspace_id`, `created_at`, `updated_at`. IDs are UUIDs. Money is stored as integer minor units + currency. Timestamps are UTC.

**Identity and access**

- `users` (id, email, name, image, status, last_seen_at)
- `accounts`, `sessions`, `verification_tokens` (Auth.js adapter tables)
- `workspaces` (id, name, slug, timezone, currency, created_by)
- `memberships` (workspace_id, user_id, role, invited_by, accepted_at) — unique(workspace_id, user_id)
- `invites` (email, role, token_hash, expires_at)
- `api_keys` (workspace_id, name, hashed_key, scopes, last_used_at, revoked_at) — for future integrations, not the UI

**CRM / revenue**

- `leads` (source, status, contact fields, company, industry, services[], budget_range, timeline, score, score_reason, owner_id, consent flags, dedupe_hash)
- `lead_events` (lead_id, type, actor, payload)
- `lead_research` (lead_id, run_id, summary, sources JSONB, confidence, created_at)
- `clients` (converted lead/company record)
- `proposals` (client/lead, status, version, currency, totals, valid_until, share_token_hash)
- `proposal_items` (proposal_id, description, qty, unit_price_minor, total_minor)
- `proposal_events` (sent, viewed, accepted, rejected, timestamps, actor)

**Delivery**

- `projects` (client_id, name, status, start_date, due_date)
- `milestones`, `tasks` (assignee user/agent, status, priority, due_at, project_id)
- `task_comments`

**Audits**

- `audits` (url, status, requested_by, run_id, scores JSONB, report_asset_key, completed_at)
- `audit_findings` (audit_id, category, severity, title, evidence JSONB, recommendation, source_tool)
- `audit_pages` (audit_id, url, status_code, findings_count)

**Agent runtime**

- `agents` (workspace_id, key, name, role, model_policy, tool_scopes[], max_steps, enabled)
- `agent_versions` (agent_id, version, prompt, config JSONB, created_by) — prompts are versioned, never edited in place
- `runs` (workspace_id, agent_id, trigger, status, input JSONB, output JSONB, budget, cost_total, started_at, finished_at, parent_run_id)
- `run_steps` (run_id, index, type, status, input, output, tokens_in, tokens_out, provider, model, started_at, ended_at)
- `run_events` (run_id, seq, type, payload, created_at) — append-only; powers SSE and replay
- `tool_calls` (run_step_id, tool_key, args_redacted, result_summary, status, duration_ms)
- `agent_messages` (run_id, from_agent, to_agent, type, content, created_at) — orchestrator-mediated only

**Approvals**

- `approvals` (workspace_id, run_id, type, risk_level, entity_type, entity_id, payload_preview, status, requested_by, assigned_role, expires_at, decided_by, decided_at, decision_notes)
- `approval_events` (approval_id, action, actor, notes, created_at)

**Memory and knowledge**

- `knowledge_sources` (workspace_id, type: url/file/note, title, uri, status, checksum, created_by)
- `documents` (source_id, filename, mime, size, storage_key, extracted_text_status)
- `memory_entries` (workspace_id, kind: fact/insight/preference, content, source_ids[], confidence, sensitivity, status: draft/approved/rejected, approved_by)
- `memory_chunks` (memory_entry_id/document_id, content, embedding vector(N), token_count, metadata JSONB)
- Optional: `memory_links` for entity associations (lead, client, project)

**Usage, cost and audit**

- `usage_events` (workspace_id, run_id, agent_id, provider, model, tokens_in, tokens_out, cached_tokens, cost_minor, price_version, created_at) — immutable
- `model_prices` (provider, model, input_per_million_minor, output_per_million_minor, effective_from)
- `budgets` (workspace_id, period, limit_minor, spent_minor, hard_stop)
- `audit_logs` (workspace_id, actor_type, actor_id, action, entity_type, entity_id, before JSONB, after JSONB, ip_hash, user_agent, request_id, created_at) — append-only
- `settings` (workspace_id, key, value JSONB)
- `outbox` (type, payload, status, attempts) — for reliable webhooks/emails
- `idempotency_keys` (workspace_id, key, request_hash, response, expires_at)

**Jobs**

- `job` / `archive` (pg-boss managed) — not hand-authored beyond the library's schema.

### 4.3 Tenancy and isolation

- Single workspace in MVP, but every table uses `workspace_id` from day one.
- Data access goes through a session-scoped repository layer that injects `workspace_id`; raw queries with a client-supplied workspace are forbidden.
- Postgres RLS policies on tenant tables as a second line of defense (session variable set per transaction).
- Cross-tenant access tests are part of the Phase 2 definition of done.

### 4.4 Migrations, backups, retention

- Drizzle Kit migrations committed to the repo; staging applied first; no manual production edits.
- Backups: provider PITR (7–30 days) + nightly logical dump to object storage; quarterly restore drill.
- Retention defaults (proposed): leads 24 months after last activity; audit artifacts 12 months; usage events 24 months; security audit logs 12 months; memory entries until deleted/approved deletion.
- Secrets and raw provider payloads are never stored in logs; redact before persistence.

---

## 5. AI model provider abstraction

### 5.1 Internal interface (proposed)

```
LLMProvider
  generate({ model, messages, tools?, temperature, maxTokens, responseFormat })
  stream({ ... }) -> async iterator of deltas
  embed({ model, input[] }) -> vectors
  capabilities(model) -> { contextWindow, supportsTools, supportsJSON, inputCost, outputCost }
```

Adapters: OpenAI, Anthropic, Google. A thin shared layer (optionally Vercel AI SDK) handles streaming/tool-call normalization, but the **internal interface is the contract**; no route or agent imports a vendor SDK directly.

### 5.2 Model policy

- **Fast tier** (cheap/fast): classification, extraction, summaries, lead scoring drafts.
- **Standard tier**: proposal drafting, audit narrative, research synthesis.
- **Reasoning tier** (optional): complex planning/review, used sparingly and approval-gated by budget.
- Model choice is configuration per agent version, not hard-coded.
- Embeddings: one provider/model per workspace, recorded in `memory_chunks`; re-embed jobs support model changes.

### 5.3 Guardrails

- Timeouts (per call and per run), bounded retries with jitter, circuit breaker per provider.
- Hard caps: max steps, max tool calls, max tokens, max cost per run.
- Structured outputs validated with Yup (already in the stack) before use; invalid outputs become retryable failures, never silent fallbacks.
- Prompt injection defenses: retrieved content is treated as untrusted data; tools enforce permissions independently of model instructions.
- PII redaction in logs; provider data-retention settings documented per vendor.
- Provider outage behavior: fast tier falls back to a secondary provider only if the agent policy allows; otherwise the run pauses and reports a clear error.

---

## 6. Multi-agent orchestration design

### 6.1 Approach

Proposed: a **lightweight, database-backed supervisor orchestrator**, not a graph framework in Phase 2.

- Deterministic supervisor code decomposes work into steps and assigns agent roles.
- Each step is persisted (`run_steps`), with inputs/outputs and tool calls.
- Agent-to-agent communication is structured messages stored in `agent_messages`, always routed through the orchestrator (no autonomous peer loops).
- Run state machine is explicit; resumability is a first-class requirement.

Why not LangGraph/BullMQ-heavy stacks initially: fewer moving parts, visible state, JS-native, easier to secure and audit. Revisit only if workflows become deeply branching.

### 6.2 Proposed agent roles (MVP)

| Agent | Responsibility | Tools (proposed) | Writes |
| --- | --- | --- | --- |
| Coordinator | Plan, assign steps, enforce budgets, summarize | run state, read lead/project, request approval | runs/steps |
| Research Analyst | Enrich leads from public sources, score fit | web fetch (SSRF-safe), search API (optional), read memory | lead_research (drafts) |
| Audit Analyst | Run checks and summarize evidence | PSI/Lighthouse, axe, fetch, storage | audits/findings (drafts) |
| Proposal Writer | Draft proposals from templates and catalog | read pricing/services, read lead, read approved memory | proposal draft |
| Reviewer/QA | Check grounding, schema validity, policy | read run artifacts, validation tools | review notes, block sends |

Human roles remain separate from agents. There is no “autonomous employee” framing in the UI.

### 6.3 Task and run lifecycle

```
queued → planning → running → (waiting_approval) → resuming → completed
                          ↘ retrying ↗        ↘ failed
                          ↘ cancelled
```

- **queued:** job accepted, run row created, idempotency key stored.
- **planning:** supervisor produces a bounded plan (steps, agents, budget).
- **running:** steps execute sequentially or in limited parallel; each step records tokens/cost.
- **waiting_approval:** run pauses with a persisted checkpoint; no further tool calls until decision.
- **resuming:** decision event triggers the next step; idempotency prevents duplicate side effects.
- **completed/failed/cancelled:** terminal; failure includes a user-readable reason and retry policy.

Every transition emits `run_events`, enabling SSE progress and replay. Retries are step-scoped; completed steps are not repeated.

### 6.4 Tool registry and permissions

- Tools are registered server-side with: key, input schema, output schema, required role, required agent scope, side-effect class (read/write/external/destructive), timeout, rate limit.
- Agent versions declare allowed tools (`tool_scopes`); the executor re-checks permission at call time.
- External side effects go through the outbox/approval system, never directly from a model response.
- Tool arguments and results are summarized in `tool_calls`; raw sensitive payloads are redacted.

---

## 7. Background job execution and scheduling

### 7.1 Proposed queue

**pg-boss** on the primary Postgres (recommended while volume is low). It provides durable jobs, retries, backoff, scheduling and dead-letter handling without another service.

Alternatives:

- Graphile Worker: strong Postgres-based runner; slightly more setup, good high-throughput choice.
- Managed queue (SQS/Cloud Tasks) + worker: more moving parts.
- Inngest/Trigger.dev: best fit if hosting remains serverless; usage-based pricing.

### 7.2 Job catalog (proposed)

| Job | Trigger | Timeout | Side effects |
| --- | --- | --- | --- |
| `run.execute` | API request / schedule | 10–30 min (worker) | Internal; external via tools |
| `lead.research` | Lead created / manual | 5 min | Read-only web + memory |
| `audit.run` | Audit requested | 10 min | Read-only fetch + storage |
| `proposal.draft` | Proposal requested | 5 min | Draft only |
| `email.send` | Approved outbox item | 1 min | External (approval required) |
| `memory.index` | Source uploaded/approved | 10 min | Embedding writes |
| `usage.rollup` | Hourly/daily | 2 min | Reporting tables |
| `retention.cleanup` | Daily | 10 min | Destructive (policy-based, audited) |
| `backup.verify` | Weekly | 10 min | Read-only checks |

### 7.3 Queue semantics

- At-least-once delivery; handlers must be idempotent.
- Concurrency limits per queue and per workspace; global cap to protect the DB.
- Exponential backoff with jitter; max attempts; dead-letter queue with alerting.
- Long tasks renew leases and check for cancellation.
- Scheduler runs in the worker (single active scheduler), not in web requests.

---

## 8. Agent memory and knowledge management

### 8.1 Memory tiers

1. **Short-term (run context):** persisted step history and summaries; bounded by token budget. Not reused across runs automatically.
2. **Long-term structured memory:** curated facts, preferences and insights (`memory_entries`) with source, confidence, sensitivity and approval status. Only `approved` entries are retrievable by agents.
3. **Document knowledge:** uploaded files/URLs → extracted text → chunks → embeddings (`memory_chunks`, pgvector). Scoped to workspace and optionally to a client/project.

### 8.2 Ingestion pipeline

```
Source (upload / URL / note)
  → validate type + size (and malware scan if files)
  → extract text (HTML/PDF/text)
  → clean + chunk (overlap, token-aware)
  → embed (provider abstraction)
  → store chunks + metadata + checksum
  → index (HNSW/IVFFlat) and full-text index
```

- Re-ingest on checksum change; deduplicate by hash.
- Deletions cascade to chunks and embeddings.
- Files live in object storage; the DB stores metadata and extracted text chunks only.

### 8.3 Retrieval

- Hybrid retrieval: vector similarity + Postgres full-text/trigram, merged and capped by token budget.
- Filters always include `workspace_id`; optional client/project/sensitivity filters.
- Results return source references; generated answers must cite source IDs when used in proposals/audits.
- Retrieval is a tool with strict top-k and size limits to prevent context flooding.

### 8.4 Memory write policy

- Agents may propose memory entries (`status = draft`), never write directly to approved memory.
- Sensitive categories (contracts, pricing exceptions, personal data) require explicit approval.
- Users can approve, edit or reject drafts; every decision is audited.
- Retention: rejected drafts deleted after 30 days; approved entries retained until deleted by an admin.

---

## 9. Security and permission model

### 9.1 Authentication (proposed)

- **Auth.js (NextAuth) v5** with the Postgres adapter and database sessions.
- Primary method: **email magic link** (no password storage). Optional Google SSO if the team asks.
- Invite-only workspace membership in Phase 2 (no public sign-up).
- Sessions: HTTP-only, Secure, SameSite=Lax cookies; rotation on privilege change; absolute + idle expiry.
- Middleware blocks unauthenticated `/workspace/*`; the workspace layout re-verifies server-side (defense in depth).

Alternatives: Supabase Auth (if Supabase DB chosen) or Clerk (fastest, per-MAU cost). Recommendation: Auth.js for portability and no per-user fee.

### 9.2 Roles (proposed)

| Role | Read | Create/edit leads, audits, proposals | Approve | Send external | Settings/billing |
| --- | --- | --- | --- | --- | --- |
| Owner | All | Yes | Yes | Yes | Yes |
| Admin | All | Yes | Yes | Yes (within limits) | Yes |
| Member | All (non-sensitive) | Yes (own drafts) | No | No (request only) | No |
| Viewer | Read-only | No | No | No | No |

- MVP ships Owner + Member; Admin/Viewer are schema-ready.
- Approval thresholds and spend limits are per-role and per-workspace.
- Agent service identity is separate from user identities and has narrower, explicit scopes.

### 9.3 API and platform security checklist

- Session + role check on every `/api/workforce/*` route; deny by default.
- CSRF protection for cookie-based mutations (same-origin enforcement + token/double-submit).
- Yup validation on all inputs; strip unknown fields; size limits.
- Rate limits per user/IP/workspace (login, mutations, AI runs).
- No cross-origin CORS for private APIs; webhooks use HMAC signatures + timestamp + replay prevention.
- SSRF protection for URL fetching: allow http/https only, resolve DNS and block private/link-local/loopback ranges, limit redirects, timeouts, response size caps.
- File uploads: type allowlist, size cap, random storage keys, no public bucket, optional malware scanning.
- Content Security Policy (proposed; currently absent), HSTS at the platform layer, frame restrictions already present.
- Secrets only in server env; never in client bundles, logs, or error messages. Deep diagnostics admin-only and coarse.
- Idempotency keys for all external side effects; outbox pattern for email/webhooks.
- Audit logging for auth events, role changes, approvals, sends, deletes, settings, budget changes.
- Dependency scanning and lockfile review before each deployment.
- Backups encrypted; access to production data limited and logged.

### 9.4 PII and compliance considerations (proposed)

- Consent/source recorded on lead records; deletion workflow for data-subject requests.
- Minimize PII in prompts; redact logs; configurable provider data-retention settings.
- Data residency: choose an India/Singapore region where available; document subprocessors (LLM, email, storage).
- No scraping behind logins; respect robots.txt and site terms; store source URLs/attribution.

---

## 10. Human approval architecture

### 10.1 Approval gates (proposed)

| Gate | Trigger | Risk | Default approver |
| --- | --- | --- | --- |
| `outbound_email` | Agent wants to send email | High | Admin |
| `proposal_send` | Proposal marked ready to send | High | Owner/Admin |
| `spend_threshold` | Run cost exceeds limit | Medium | Owner |
| `memory_sensitive` | Sensitive memory write | Medium/High | Admin |
| `publish_content` | Public-facing content changes | High | Owner |
| `destructive_change` | Delete/archive records | High | Owner |
| `project_plan_apply` | Agent-proposed project plan | Medium | Admin |

### 10.2 Flow

```
Agent step → creates approval (payload preview + evidence + expiry)
  → run status = waiting_approval
  → UI queue shows diff/preview, requester, risk, cost so far
  → Approve / Reject / Request changes
  → decision event stored; run resumes or is cancelled
  → side effect executes through outbox with idempotency key
```

- Approvals are scoped to a workspace and role; two-person approval can be required for high risk.
- Expired approvals fail closed (no action) and notify the requester.
- Decisions and previews are immutable in `approval_events`.
- The UI never shows “sent” until the provider confirms delivery; delivery outcomes are recorded separately.

---

## 11. Lead research and qualification

### 11.1 Pipeline (proposed)

1. **Capture:** existing contact form (optional write-through later), workspace manual entry, CSV import, signed inbound webhook.
2. **Deduplicate:** normalized email/phone/domain hash; merge suggestions, never silent overwrite.
3. **Enrich:** fetch the public website, extract services/locations/tech signals; optional search API for public mentions. No login-walled or paid-list scraping.
4. **Score:** deterministic rubric (fit, intent, budget, timeline, risk) + LLM explanation grounded in captured fields.
5. **Summarize:** a short qualification brief with source links and confidence.
6. **Next action:** recommend outreach or disqualify; external outreach requires approval in Phase 2.
7. **Convert:** accepted lead → client + project (manual press, audited).

### 11.2 Scoring model (proposed)

- Weighted rubric in code (not model-decided weights): industry fit 25%, service match 20%, budget 20%, timeline 15%, evidence quality 10%, risk 10%.
- LLM may only adjust within bounded ranges and must cite fields; final score is computed and stored with inputs.
- Deterministic fallback score if the provider is unavailable; UI labels it as “rules only”.
- Scores are advisory; humans can override with a reason.

### 11.3 Compliance

- Record source/consent per field; support deletion and export.
- Respect robots.txt; throttle requests; identify the crawler where required.
- No automated cold outreach in MVP; drafts only.

---

## 12. Website auditing and reporting

### 12.1 Checks (proposed MVP)

| Category | Checks | Evidence source |
| --- | --- | --- |
| Performance | Core Web Vitals / Lighthouse scores | PageSpeed Insights API (preferred) or local Lighthouse |
| SEO | Title/meta, H1 structure, canonicals, robots, sitemap, structured data, internal links | HTML parse + fetch |
| Accessibility | Automated axe-core rules | axe-core in worker/browser |
| Technical | HTTP status, redirects, HTTPS, security headers, broken links (sampled) | Fetch checks |
| Content | Thin/duplicate content signals, missing alt text | Parse + heuristics |

### 12.2 Execution

- Primary: PageSpeed Insights API (free quota, no browser infrastructure). Quota exhaustion falls back to a worker-run Lighthouse with Playwright/Chromium only if approved (resource-heavy).
- All fetches pass the SSRF guard; audit only public URLs the user is authorized to review (checkbox + recorded acknowledgment).
- Findings are stored as structured rows with severity, evidence, and recommendation; no metric is invented by the model.
- Artifacts (JSON, screenshots, generated report) go to object storage with signed, time-limited URLs.
- AI role: prioritize and explain findings using only tool evidence; a Reviewer step validates citations before publishing.

### 12.3 Reporting

- Workspace report page: scores, findings by severity, evidence, quick wins.
- Export: HTML/PDF generated server-side in a later step; share links are signed and expire.
- Audit-to-proposal: selected findings can seed proposal scope with approval.

---

## 13. Proposal generation and project management

### 13.1 Proposal flow

1. Select lead/client + services (seeded from existing `src/data/services.js` and pricing content).
2. Template defines sections, payment terms and validity; pricing math is deterministic server code.
3. AI drafts narrative sections only; line items and totals come from the catalog.
4. Reviewer checks scope/pricing consistency; human edits are preserved.
5. Approval gate → send via email with a signed, expiring link (no PDF attachment in MVP).
6. Track viewed/accepted; acceptance creates a project proposal record (manual confirmation before project creation).

### 13.2 Project management

- Projects, milestones and tasks with owners (human or agent), statuses, due dates and activity history.
- AI “Coordinator” proposes plans and updates; applying a plan requires approval.
- Agent task updates are auditable and reversible; no silent status changes.
- Reuse workspace list/table patterns from Phase 1; add filters and empty states consistently.

---

## 14. Usage tracking, costs and audit logs

### 14.1 Metering

- Provider adapter emits a `usage_event` per call with tokens, cached tokens, model, price version and computed cost.
- Costs are integers (minor units) to avoid floating-point drift.
- Every run has a budget; every workspace has a monthly budget with soft alert and hard stop thresholds.
- Usage dashboards show real values only; until events exist, empty states remain.

### 14.2 Cost controls

- Per-run caps (tokens/cost/steps), per-agent caps, per-workspace monthly cap.
- Cheap-tier default with explicit escalation; cache where safe (embeddings, repeated summaries).
- Alerts at 50/80/100% via email/workspace notification.
- Hard stop pauses new runs (not running ones) and requires an owner override with an audit entry.

### 14.3 Audit logs

- Append-only security/business log separate from run traces.
- Fields: actor type/id, action, entity, before/after (redacted), request ID, IP hash, user agent, timestamp.
- Exportable CSV; retained 12 months (proposed); tamper-evidence via periodic hash chain optional.
- Run traces retained 90 days by default (proposed) with configurable retention.

---

## 15. API security and permissions (summary)

- Deny-by-default route protection; explicit permission per endpoint (read/write/approve/admin).
- Agents act through the same permission checks as users, with narrower scopes.
- Never accept `workspace_id` from the client for authorization decisions; derive it from the session.
- Validate and cap every external fetch and file upload.
- Webhooks signed (HMAC-SHA256 + timestamp + nonce); reject replays.
- Backoffice/admin routes separated and role-gated.
- All errors use stable codes without internal details; detailed diagnostics only in server logs.
- Public endpoints (`/api/contact`, coarse health) remain isolated from workforce APIs and cannot trigger agent runs.

---

## 16. Infrastructure and hosting requirements

### 16.1 Requirements

- Node.js runtime compatible with Next.js 16 (long-running `next start` or serverless).
- Managed PostgreSQL with pgvector and PITR.
- Background worker runtime (container preferred) with outbound HTTPS.
- Object storage (S3-compatible) private by default.
- Domain/TLS for the existing public site and workspace.
- Email provider (Resend already supported by the contact route).
- Region close to India (Mumbai/Singapore) for latency and residency.
- Secrets management via the hosting provider; no secrets in git.
- Observability: structured logs, error tracking (e.g., Sentry, proposed), uptime checks, DB metrics.
- Staging environment with a separate database branch/schema and non-production secrets.

### 16.2 Hosting options

| Option | Fit | Notes |
| --- | --- | --- |
| Railway/Fly/Render + Neon + R2 | **Recommended** | Web + worker + managed DB; simple ops; predictable |
| Vercel + Neon + Inngest/Trigger.dev + R2 | Good if already on Vercel | Long tasks need managed workflow; watch invocation costs |
| AWS ECS/RDS/S3/SQS | Enterprise-grade | Highest setup/ops overhead for current team size |
| Self-managed VPS/Docker Compose | Lowest cost | Not recommended for PII/security burden |

### 16.3 Environment variables (names only, proposed — values not created)

- `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations)
- `AUTH_SECRET`, `AUTH_URL`, `AUTH_EMAIL_SERVER`, `AUTH_EMAIL_FROM`
- `LLM_OPENAI_API_KEY`, `LLM_ANTHROPIC_API_KEY`, `LLM_GOOGLE_API_KEY` (only those used)
- `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL`
- `PAGESPEED_API_KEY` (optional)
- `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`
- Existing contact delivery variables remain unchanged.
- Worker: `WORKER_CONCURRENCY`, `QUEUE_DATABASE_URL` (if separate pool)
- `SENTRY_DSN` (optional), `APP_BASE_URL`

These are proposals and will be documented in `.env.example` only after approval. No values are created or exposed here.

### 16.4 Deployment and release process (proposed)

- CI: lint + build + tests on pull request; migrations checked in; no production deploy from a developer laptop.
- Migrations run as a separate step with a backup/snapshot first.
- Health checks before traffic cutover; rollback plan per release.
- No deployment or push without explicit approval (per standing instruction).

---

## 17. Estimated operating costs (assumptions, not quotes)

### 17.1 Assumptions

- Team: 2–3 internal users; one workspace.
- Monthly volume at MVP: 250 leads, 60 website audits, 40 proposals, 11 workspace sections in use.
- ~3.3M input / 0.9M output LLM tokens per month with a mostly cheap-model mix; occasional premium calls.
- ~2M embedding tokens/month; 20 GB artifacts/storage; 100 GB DB with backups.
- Provider prices change; verify current pricing before committing. Figures below are planning ranges, not invoices.

### 17.2 Estimated monthly range

| Item | Low | Mid | High | Notes |
| --- | --- | --- | --- | --- |
| Managed Postgres (pgvector) | $0 (free tier) | $19 | $39 | Limits on storage/connections; scale up later |
| Web hosting | $0 (hobby) | $10 | $25 | Container host or serverless plan |
| Worker hosting | $5 | $15 | $30 | Needed for durable jobs |
| LLM usage | $15 | $45 | $120 | Cheap default + premium reviews; audits add calls |
| Embeddings | $1 | $3 | $8 | Small at MVP |
| PageSpeed/audit compute | $0 | $10 | $40 | PSI quota preferred; local Lighthouse costs CPU |
| Object storage + egress | $1 | $3 | $8 | R2/S3 private bucket |
| Email delivery | $0 | $10 | $20 | Resend tier; existing account may cover |
| Error tracking/observability | $0 | $10 | $26 | Optional at MVP |
| **Total** | **~$22** | **~$125** | **~$316** | Add 15–20% buffer for spikes |

At 10× volume, expect roughly $350–$1,000/month, dominated by LLM calls and audit compute. Costs are highly sensitive to model choice and audit frequency; budgets and per-run caps are mandatory from the first release.

### 17.3 Cost controls tied to architecture

- Cheap-tier models by default; premium only with approval and budget.
- Deterministic checks perform measurement; models summarize (fewer tokens, less retry).
- Cache embeddings and repeated research summaries.
- Hard monthly cap with owner override; alerts before the cap.
- No background cron that burns tokens without a business trigger.

---

## 18. Development phases and dependencies

| Phase | Scope | Depends on | Exit criteria |
| --- | --- | --- | --- |
| **2A — Foundations** | DB provisioning, schema + migrations, Auth.js, roles, invite-only access, workspace guard, audit log, settings, deep health | Approval of vendors/env; current Phase 1 committed | Login works; unauthenticated access blocked; audit rows written; staging restored from backup |
| **2B — Runtime** | Worker, pg-boss queue, provider abstraction, agent/run tables, run UI, usage metering, budgets, approvals engine | 2A | A test agent run completes, pauses for approval, resumes; costs metered; budgets enforced |
| **2C — Lead & audit MVP** | Lead capture/import, research pipeline, scoring, audit execution (SEO/perf/a11y), findings + report page | 2B | A real public URL is audited with evidence; lead research produces a sourced brief; no external send without approval |
| **2D — Proposals & projects** | Proposal templates/line items, draft/approve/send link, acceptance tracking, project + tasks creation | 2C | A proposal is drafted, approved, sent via link, and accepted; project created auditable |
| **2E — Memory** | Knowledge sources, ingestion, chunking, embeddings, hybrid retrieval, memory approval queue | 2B (2C/2D benefit) | Retrieved answers cite sources; sensitive memory cannot bypass approval |
| **2F — Hardening & launch** | Security review/pen test, RLS verification, rate limits, CSP, backups/restore drill, observability, load tests, runbooks | 2A–2E | Security checklist signed off; restore drill passes; on-call/runbook documented |

**Dependencies:** hosting/DB decisions before 2A; auth method before 2A; LLM providers and budget before 2B; audit execution choice before 2C; email sending domain before 2D.

---

## 19. Initial MVP scope (proposed)

**In scope**

- Invite-only authentication with Owner/Member roles; protected workspace.
- Single workspace; schema ready for more.
- Lead capture (manual + import + optional contact-form write-through) with dedupe and scoring.
- Lead research briefs from public data with citations, no automated outreach.
- Website audits for SEO, performance and accessibility with evidence and a report page.
- Proposal drafts from templates/catalog with human approval and signed email links.
- Approval queue for external/destructive actions.
- Usage and cost dashboard with real metered data; budgets and hard caps.
- Audit log for security/business events.
- Settings for workspace, members and budgets.

**Out of scope for MVP (explicitly)**

- Fully autonomous outbound email/WhatsApp or social posting.
- Client portal and client logins.
- Billing/subscriptions and multi-workspace accounts.
- Voice agents, ERP/accounting sync, ad-platform automation.
- Automatic memory writes without approval.
- Fine-tuning/custom models.
- Public AI chat on the marketing site.

**MVP acceptance highlights**

All facts in reports trace to tool evidence; every external action is approval-gated; costs never exceed the workspace cap without an owner override; no cross-workspace data access; unauthenticated requests cannot reach workforce APIs or trigger runs.

---

## 20. Risks and trade-offs

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM hallucination in audits/proposals | Wrong advice or scope | Tool-grounded metrics, citations, Reviewer agent, human approval for external outputs |
| Runaway AI costs | Budget overrun | Model tiers, per-run caps, monthly hard stop, alerts, caching |
| Security breach of workspace | Data loss/exposure | Auth.js, RLS, least privilege, rate limits, pen test, audit logs |
| SSRF via audit/research fetches | Internal network exposure | Strict URL validator, DNS/IP blocking, redirect limits, egress controls |
| Multi-tenant data leakage | Trust and legal damage | Mandatory `workspace_id`, repository layer, RLS, cross-tenant tests |
| Postgres queue limits at scale | Delayed jobs | Concurrency caps; migrate to dedicated queue when thresholds are hit |
| Serverless timeouts for long audits | Failed runs | Container worker (recommended) or managed durable workflow |
| Vendor lock-in | Migration cost | Standard Postgres, provider/storage/queue adapters, portable schema |
| Scraping/legal exposure | Complaints/liability | Public data only, robots/ToS compliance, attribution, no login-walled sources |
| PII/compliance gaps (DPDP) | Regulatory risk | Consent/source tracking, retention, deletion workflow, subprocessor list |
| Single-region latency/outage | UX and availability | India/SG region, backups, provider fallback, status page |
| Prompt injection via fetched content | Unauthorized tool use | Tools enforce permissions; untrusted content never bound to instructions; allowlists |
| Solo-maintainer operational load | Slow recovery | Managed services, IaC/runbooks, backups, staged rollout |

**Key trade-offs**

- **Custom orchestrator vs framework:** more code to own, but transparent, JS-native and auditable. Revisit if branching complexity grows.
- **Neon vs Supabase:** portability and clean separation vs fewer vendors. Supabase is a valid faster start if the team accepts coupling.
- **Containers vs serverless:** predictable long jobs and one runtime vs zero-ops web hosting. Worker hosting is the deciding factor.
- **One Postgres for queue + data:** fewer services now; throughput ceiling later, mitigated by caps and a planned migration path.
- **Magic links vs passwords:** simpler and safer, but email deliverability becomes critical; SSO can be added without changing roles.

---

## 21. Decisions requiring approval before implementation

1. **Commit Phase 1** (currently uncommitted) before starting Phase 2.
2. **Database:** Neon PostgreSQL (recommended) vs existing managed Postgres vs Supabase.
3. **ORM:** Drizzle (recommended) vs Prisma.
4. **Auth:** Auth.js magic link (recommended) vs Google SSO vs Supabase Auth/Clerk.
5. **Hosting model:** containers + worker (recommended) vs Vercel + managed workflows.
6. **Queue:** pg-boss on primary Postgres (recommended) vs managed queue/workflow.
7. **LLM providers and default model tiers** plus a monthly budget cap.
8. **Embeddings provider/model** and vector dimensions.
9. **Object storage** provider/bucket and retention.
10. **Email sending account/domain** for invitations and proposals.
11. **Approval thresholds** (spend limits, two-person approvals) and role assignments.
12. **Compliance posture:** retention periods, data residency, subprocessors, deletion policy.
13. **Audit execution:** PageSpeed API-first vs local Lighthouse worker.
14. **Environment changes:** approval for the new variable names in Section 16.3.
15. **Package additions:** Auth.js, Drizzle, pg-boss, provider SDKs, pgvector client, etc. (only after approval, introduced phase by phase).

---

## Appendix A — Proposed schema at a glance

```
users ─┬─ memberships ── workspaces
       ├─ sessions/accounts/verification_tokens
       └─ invites

workspaces ─┬─ leads ─┬─ lead_events
            │         └─ lead_research
            ├─ clients ─┬─ proposals ─┬─ proposal_items
            │           │             └─ proposal_events
            │           └─ projects ─┬─ milestones
            │                        └─ tasks ── task_comments
            ├─ audits ─┬─ audit_findings
            │          └─ audit_pages
            ├─ agents ── agent_versions
            ├─ runs ─┬─ run_steps ─┬─ tool_calls
            │        ├─ run_events
            │        └─ agent_messages
            ├─ approvals ── approval_events
            ├─ knowledge_sources ── documents ─┐
            ├─ memory_entries ── memory_chunks ─┘ (pgvector)
            ├─ usage_events / model_prices / budgets
            ├─ audit_logs
            ├─ settings / outbox / idempotency_keys
            └─ (pg-boss job tables)
```

## Appendix B — What is explicitly *not* decided

- Managed vendor contracts, regions, and pricing.
- Whether the public contact form writes directly into `leads` (write-through) or stays webhook-only.
- Whether multi-workspace support ships before or after the MVP.
- Client-facing portal and pricing/billing.
- Final approval matrix and spend limits.

---

**No implementation has been started.** This document is the only file added for Phase 2 planning. Awaiting approval of the decisions in Section 21 before any package installation, environment change, schema creation, or code modification.
