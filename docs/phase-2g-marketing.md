# Phase 2G — Marketing & Website Execution Engine

Phase 2G adds an internal marketing and website execution engine on top of the
existing workspace. It reuses the shared database, connection pool,
configuration, auth/RBAC, audit log, clients, projects, tasks and knowledge
systems. It does not introduce a second database, a new environment, or any
external publishing path.

Everything in this phase is **internal record-keeping**. No content is
published, no ad account is connected, no spend occurs, and no live website is
edited by this system.

## 1. Safety model

- **States are explicit and separate.** A record moves through planned → draft
  → awaiting review → approved → scheduled → executed, plus failed/cancelled.
  A draft is never presented as published; approval is never presented as
  execution.
- **No external action.** Campaign status changes never touch an ad account.
  Content scheduling is a calendar entry, not a post. Website proposals record
  *manual* execution with evidence; the system never claims it edited a site.
- **Evidence and feedback required.** Approving, rejecting, recording execution
  and resolving findings require notes/evidence where the workflow depends on
  them.
- **Append-only versions.** Content and website proposals keep version rows;
  approving one version and then editing starts a new draft without overwriting
  the approved version.

## 2. Data model (migration `0008`, additive; `0009`, additive review columns)

| Table | Purpose |
| --- | --- |
| `marketing_profiles` | One marketing profile per client (industry, audience, voice, services, locations). |
| `marketing_campaigns` | Planning-only campaigns with estimated budgets. |
| `marketing_content_items` | Content records with status and workflow timestamps. |
| `marketing_content_versions` | Append-only content versions (body, source, change note). |
| `marketing_website_pages` | Website page inventory with original content notes. |
| `marketing_website_proposals` | Website change proposals with status and latest version. |
| `marketing_website_proposal_versions` | Append-only proposal versions. |
| `marketing_metrics` | Performance figures with an explicit source label. |
| `marketing_reports` | Reporting snapshots built from recorded metrics. |

`0009` adds review and publishing metadata to `marketing_content_items`:
`reviewed_by_user_id`, `reviewed_at`, `review_feedback`, `published_at`,
`publish_note`. Both migrations are additive and safe to apply forward.

SEO findings reuse the existing `website_audits` / `website_audit_findings`
tables from Phase 2C; Phase 2G adds a marketing-facing overview and conversion
to project tasks, not a parallel findings store.

## 3. Library (`src/lib/marketing/`)

- `validation.js` — Yup schemas for profiles, campaigns, content, actions,
  website pages/proposals, metrics, reports and narrative actions.
- `helpers.js` — workspace-scoped `assertClient` / `assertProject` /
  `assertPage` / `assertProposal` / `assertDateOrder`, `NOT_FOUND`/
  `CLIENT_NOT_FOUND` errors, option list loaders.
- `service.js` — client profiles, campaigns, campaign status transitions and
  client approval.
- `content.js` — content creation, append-only versions, content action state
  machine (start draft, submit, approve, reject, schedule, unschedule, record
  published, record failure, cancel).
- `website.js` — page inventory, proposals, proposal actions including manual
  execution that requires evidence and returns `externalAction: false`.
- `seo.js` — marketing findings overview and per-client finding listing.
- `reporting.js` — metric recording, report snapshots (sums/averages/derived),
  report narratives, marketing dashboard and client summary.

## 4. API (app router, `/api/workforce`)

Marketing: `clients`, `clients/[clientId]/summary`, `campaigns`,
`campaigns/[campaignId]` (+`status`, `approval`), `content`,
`content/[contentId]` (+`versions`, `actions`), `website-pages`,
`website-pages/[pageId]`, `proposals`, `proposals/[proposalId]`
(+`versions`, `actions`), `metrics`, `reports`, `reports/[reportId]`
(+`narrative`), `dashboard`, `overview`.

SEO findings: `website-audits/[auditId]/findings` and
`website-audits/[auditId]/findings/[findingId]` (+`task`).

All routes use the shared `{ ok, data }` / `{ ok: false, error }` envelope,
same-origin checks, rate limiting, workspace scoping and permission checks.

## 5. Permissions

New permissions: `marketing.view`, `marketing.manage`, `marketing.approve`,
`marketing.execute`, `marketing.report`.

| Role | Marketing permissions |
| --- | --- |
| owner / admin / manager | view, manage, approve, execute, report |
| member / specialist | view, manage, report (not approve, not execute) |
| viewer | view |

Every role that holds `marketing.view` also holds `audits.view`, so the SEO
findings screens reuse the existing audit permission.

## 6. UI routes (`/workspace/marketing`)

- `/workspace/marketing` — control room (state model, counts, activity).
- `/workspace/marketing/clients` and `/clients/[clientId]` — profiles.
- `/workspace/marketing/campaigns` (+ `new`, `[campaignId]`).
- `/workspace/marketing/content` (+ `new`, `[contentId]`).
- `/workspace/marketing/calendar` — internal content calendar.
- `/workspace/marketing/website` (+ `pages/new`, `proposals/new`,
  `proposals/[proposalId]`).
- `/workspace/marketing/audits` (+ `[auditId]`) — SEO findings and task
  generation (links to the existing audit queue at `/workspace/website-audits`).
- `/workspace/marketing/reports` (+ `[reportId]`) — metrics and reports.

The workspace navigation gains a single `Marketing` entry gated by
`marketing.view`.

## 7. QA

Commands run locally (no production credentials):

- `npm run lint` — clean.
- `npm test` — unit suite; `tests/phase2g-marketing.test.mjs` covers permission
  least-privilege, status labels, scheduled≠published, external-action copy,
  transitions and validation.
- `npm run test:integration` — DB-backed suite with `.env.local`; includes
  `tests/phase2g-marketing-integration.test.mjs` (isolation, transitions,
  versioning, execution evidence, duplicate-task guard, source-labelled
  reporting).
- `npm run build` — production build compiles all marketing routes.
- Browser QA against the production build on port 3100: every marketing route
  rendered server-side with the expected headings and safety notices, the
  workspace navigation exposes the Marketing entry, and an unknown campaign id
  renders the workspace 404. Dev-mode streaming did not settle in the in-app
  browser, so browser QA was performed on the production build.

## 8. Limitations

- No external publishing, ad delivery, spend or live website edits by design.
- AI-generated content and narratives depend on the existing AI runtime; when
  no provider is configured, generation is unavailable and the manual paths are
  used.
- No automated responsive/mobile browser suite; browser QA this phase was
  desktop on the production build.
- The Phase 2G migrations were applied only to the local development and test
  databases. They were not applied to any production database.

## 9. Deployment

None. No commit, push, deploy, Vercel change, Neon change, production migration
or live publishing was performed. The public website was not modified.
