import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';
import {
  AuditCancelledError,
  AUDIT_SCORING,
  auditWebsite,
  scoreFindings,
} from '@/lib/audits/engine';
import {
  websiteAuditCreateSchema,
  websiteAuditQuerySchema,
} from '@/lib/audits/validation';
import {
  isBlockedAddress,
  safeFetch,
} from '@/lib/net/safe-fetch';
import {
  isPathAllowed,
  parseRobots,
  rulesForAgent,
} from '@/lib/audits/robots';

const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

let service = null;

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  service = await import('@/lib/audits/service');
}

after(async () => {
  await closeDatabase();
});

const HOMEPAGE = `<!doctype html><html lang="en"><head>
<title>Audit Test Home</title>
<meta name="description" content="A sufficiently long meta description used by the audit test site for verification purposes.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<link rel="canonical" href="https://audit.test/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Audit Test"}</script>
</head><body>
<h1>Welcome to the audit test site</h1>
<p><img src="/hero.png"></p>
<form><input type="text" name="email"></form>
<a href="/about">About us</a>
<a href="/private/secret">Private area</a>
<a href="/broken">Broken page</a>
<script src="http://insecure.example/app.js"></script>
</body></html>`;

const ABOUT = `<!doctype html><html><head>
<title>Audit Test Home</title>
<script type="application/ld+json">{ not valid json }</script>
</head><body>
<h2>A section</h2>
<h4>A deeper section</h4>
<a href="/">Home</a>
</body></html>`;

function response(overrides) {
  return {
    status: 200,
    url: overrides.url,
    redirects: [],
    headers: {},
    contentType: 'text/html; charset=utf-8',
    durationMs: 120,
    decodedBytes: 4_000,
    rawBytes: 4_000,
    compressed: true,
    truncated: false,
    text: '',
    ...overrides,
  };
}

function makeSite() {
  const requests = [];
  const pages = {
    'https://audit.test/robots.txt': response({
      url: 'https://audit.test/robots.txt',
      contentType: 'text/plain',
      text: 'User-agent: *\nDisallow: /private\nSitemap: https://audit.test/sitemap.xml\n',
    }),
    'https://audit.test/sitemap.xml': response({
      url: 'https://audit.test/sitemap.xml',
      contentType: 'application/xml',
      text: '<?xml version="1.0"?><urlset><url><loc>https://audit.test/</loc></url></urlset>',
    }),
    'https://audit.test/': response({
      url: 'https://audit.test/',
      text: HOMEPAGE,
      headers: {
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
    }),
    'https://audit.test/about': response({
      url: 'https://audit.test/about',
      text: ABOUT,
    }),
    'https://audit.test/broken': response({
      url: 'https://audit.test/broken',
      status: 404,
      text: '<!doctype html><html><body><h1>Not found</h1></body></html>',
    }),
  };

  const fetchPage = async (url, options) => {
    requests.push({ url, options });
    const entry = pages[url];
    if (!entry) {
      throw Object.assign(new Error(`No fixture for ${url}`), {
        code: 'dns_failure',
      });
    }
    return entry;
  };

  return { fetchPage, requests, pages };
}

test('audit schemas normalise URLs and cap the page limit', async () => {
  const parsed = await websiteAuditCreateSchema.validate({
    url: 'audit.test',
  });
  assert.equal(parsed.url, 'https://audit.test');
  assert.equal(parsed.maxPages, 5);

  await assert.rejects(
    websiteAuditCreateSchema.validate({ url: 'ftp://audit.test' }),
    /http or https/i,
  );
  await assert.rejects(
    websiteAuditCreateSchema.validate({ url: 'https://audit.test', maxPages: 11 }),
    /at most 10/i,
  );
  await assert.rejects(
    websiteAuditCreateSchema.validate({ url: 'https://user:pass@audit.test' }),
    /http or https/i,
  );

  const query = await websiteAuditQuerySchema.validate({ page: '2' });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 20);
});

test('robots.txt parsing applies longest-match allow rules', () => {
  const parsed = parseRobots(`
    # comment
    User-agent: *
    Disallow: /private
    Allow: /private/public
    Disallow: /*.pdf$
  `);
  const rules = rulesForAgent(parsed);
  assert.equal(rules.length, 3);
  assert.equal(isPathAllowed(rules, '/about'), true);
  assert.equal(isPathAllowed(rules, '/private/secret'), false);
  assert.equal(isPathAllowed(rules, '/private/public/notice'), true);
  assert.equal(isPathAllowed(rules, '/files/report.pdf'), false);
  assert.equal(isPathAllowed(rules, '/files/report.pdf?download=1'), true);

  const specific = parseRobots(`
    User-agent: *
    Disallow: /
    User-agent: MKWorkforceAuditBot
    Allow: /
  `);
  assert.equal(isPathAllowed(rulesForAgent(specific), '/'), true);
  assert.equal(isPathAllowed(rulesForAgent(specific, 'other-bot'), '/'), false);

  const access = parseRobots('Sitemap: https://audit.test/sitemap.xml');
  assert.deepEqual(access.sitemaps, ['https://audit.test/sitemap.xml']);
});

test('SSRF guards block private, loopback and metadata targets', async () => {
  assert.equal(isBlockedAddress('127.0.0.1'), true);
  assert.equal(isBlockedAddress('10.1.2.3'), true);
  assert.equal(isBlockedAddress('169.254.169.254'), true);
  assert.equal(isBlockedAddress('::1'), true);
  assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedAddress('93.184.216.34'), false);

  const rejects = (code) => (error) => error.code === code;

  await assert.rejects(
    safeFetch('http://localhost:3000/'),
    rejects('internal_host'),
  );
  await assert.rejects(
    safeFetch('http://127.0.0.1:3000/'),
    rejects('internal_address'),
  );
  await assert.rejects(
    safeFetch('http://169.254.169.254/latest/meta-data/'),
    rejects('internal_address'),
  );
  await assert.rejects(safeFetch('http://[::1]/'), rejects('internal_address'));
  await assert.rejects(
    safeFetch('https://user:secret@example.com/'),
    rejects('credentials_in_url'),
  );
  await assert.rejects(
    safeFetch('file:///etc/passwd'),
    rejects('unsupported_protocol'),
  );
});

test('safe fetch re-validates every redirect target', async () => {
  const publicAddress = async () => ({
    address: '93.184.216.34',
    family: 4,
  });

  const redirectToMetadata = async (url) => ({
    status: 302,
    url: url.href,
    headers: { location: 'http://169.254.169.254/latest/meta-data' },
    contentType: 'text/html',
    redirects: [],
  });

  await assert.rejects(
    safeFetch('https://public.example/', {}, {
      requestOnce: redirectToMetadata,
      resolveAddress: publicAddress,
    }),
    (error) => error.code === 'internal_address',
  );

  let hop = 0;
  const endlessRedirects = async (url) => ({
    status: 302,
    url: url.href,
    headers: { location: `https://public.example/step-${(hop += 1)}` },
    contentType: 'text/html',
    redirects: [],
  });

  await assert.rejects(
    safeFetch('https://public.example/', {}, {
      requestOnce: endlessRedirects,
      resolveAddress: publicAddress,
    }),
    (error) => error.code === 'too_many_redirects',
  );
});

test('safe fetch pins the resolved address for autoSelectFamily lookups', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body>pinned</body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const result = await safeFetch(`http://audit-pin.test:${port}/`, {}, {
      resolveAddress: async () => ({ address: '127.0.0.1', family: 4 }),
    });
    assert.equal(result.status, 200);
    assert.match(result.text, /pinned/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('audit engine crawls within limits and reports honest findings', async () => {
  const site = makeSite();
  const result = await auditWebsite({
    audit: { normalizedUrl: 'https://audit.test/', maxPages: 2 },
    fetchPage: site.fetchPage,
    delay: async () => {},
    onLog: () => {},
  });

  assert.equal(result.pages.length, 2);
  assert.deepEqual(
    result.pages.map((page) => page.url).sort(),
    ['https://audit.test/', 'https://audit.test/about'],
  );
  assert.equal(
    site.requests.some((entry) => entry.url.includes('/private/secret')),
    false,
  );
  assert.equal(result.robots.found, true);
  assert.equal(result.sitemap.found, true);

  const codes = new Set(result.findings.map((finding) => finding.code));
  for (const expected of [
    'broken_internal_links',
    'image_alt_missing',
    'form_label_missing',
    'duplicate_titles',
    'heading_hierarchy',
    'h1_missing',
    'meta_description_missing',
    'jsonld_invalid',
    'mixed_content',
    'structured_data_detected',
    'core_web_vitals_not_measured',
  ]) {
    assert.equal(codes.has(expected), true, `expected finding ${expected}`);
  }

  const cwv = result.findings.find(
    (finding) => finding.code === 'core_web_vitals_not_measured',
  );
  assert.equal(cwv.severity, 'info');
  assert.match(cwv.description, /does not run Lighthouse/i);

  assert.equal(typeof result.overallScore, 'number');
  assert.equal(
    Object.keys(result.categoryScores).sort().join(','),
    [
      'accessibility',
      'on_page_seo',
      'performance',
      'security',
      'structured_data',
      'technical_seo',
    ].join(','),
  );
  assert.match(result.scoringMethod, /not a Lighthouse/i);

  for (const finding of result.findings) {
    assert.ok(finding.title && finding.description && finding.recommendation);
  }

  const homeRequest = site.requests.find(
    (entry) => entry.url === 'https://audit.test/',
  );
  assert.equal(homeRequest.options.maxBytes, 400_000);
  assert.equal(homeRequest.options.timeoutMs, 12_000);
});

test('audit engine honours maxPages and stops cleanly on cancel', async () => {
  const site = makeSite();
  const single = await auditWebsite({
    audit: { normalizedUrl: 'https://audit.test/', maxPages: 1 },
    fetchPage: site.fetchPage,
    delay: async () => {},
  });
  assert.equal(single.pages.length, 1);
  assert.equal(single.pages[0].url, 'https://audit.test/');
  const linkCheck = site.requests.find(
    (entry) => entry.url === 'https://audit.test/about',
  );
  assert.equal(linkCheck.options.maxBytes, 150_000);

  const secondSite = makeSite();
  let checks = 0;
  await assert.rejects(
    auditWebsite({
      audit: { normalizedUrl: 'https://audit.test/', maxPages: 5 },
      fetchPage: secondSite.fetchPage,
      delay: async () => {},
      isCancelled: async () => {
        checks += 1;
        return checks >= 4;
      },
    }),
    (error) => {
      assert.equal(error instanceof AuditCancelledError, true);
      assert.equal(error.partial.pages.length, 1);
      return true;
    },
  );
});

test('scoring is a documented penalty model with a zero floor', () => {
  const score = scoreFindings([
    { category: 'security', severity: 'critical' },
    { category: 'security', severity: 'high' },
    { category: 'technical_seo', severity: 'medium' },
    { category: 'performance', severity: 'low' },
    { category: 'performance', severity: 'info' },
  ]);
  assert.equal(AUDIT_SCORING.weights.critical, 20);
  assert.equal(score.overallScore, 100 - 20 - 10 - 5 - 2);
  assert.equal(score.categoryScores.security, 70);
  assert.equal(score.categoryScores.performance, 98);
  assert.deepEqual(score.severityCounts, {
    critical: 1,
    high: 1,
    medium: 1,
    low: 1,
    info: 1,
  });

  const flattened = scoreFindings(
    Array.from({ length: 12 }, () => ({
      category: 'security',
      severity: 'critical',
    })),
  );
  assert.equal(flattened.overallScore, 0);
  assert.equal(flattened.categoryScores.security, 0);
});

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2C audits', ${`p2c-audits-${suffix}`})
    returning id
  `);
  const [user] = await query(sql`
    insert into users (email, name)
    values (${`p2c-audits-${suffix}@example.test`}, 'Audit Person')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${user.id}, 'owner')
  `);
  return { workspaceId: workspace.id, userId: user.id, suffix };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(sql`delete from users where id = ${fixture.userId}`);
}

async function insertQueuedAudit(fixture, maxPages = 2) {
  const [row] = await query(sql`
    insert into website_audits (
      workspace_id, status, requested_url, normalized_url, domain,
      max_pages, requested_by_user_id
    ) values (
      ${fixture.workspaceId}, 'queued', 'https://audit.test/', 'https://audit.test/',
      'audit.test', ${maxPages}, ${fixture.userId}
    )
    returning id
  `);
  return row.id;
}

test(
  'audit job lifecycle persists pages, findings, logs and comparison',
  { skip },
  async () => {
    const fixture = await createFixture();
    try {
      const auditId = await insertQueuedAudit(fixture);
      const site = makeSite();

      const first = await service.runWebsiteAuditJob(auditId, {
        fetchPage: site.fetchPage,
        delay: async () => {},
      });
      assert.equal(first.status, 'completed');
      assert.equal(first.pages, 2);
      assert.ok(first.findings > 0);

      const detail = await service.getWebsiteAudit(fixture.workspaceId, auditId);
      assert.equal(detail.audit.status, 'completed');
      assert.equal(detail.audit.pagesScanned, 2);
      assert.equal(typeof detail.audit.overallScore, 'number');
      assert.equal(detail.pages.length, 2);
      assert.ok(detail.findings.length >= 8);
      assert.ok(detail.logs.length >= 3);
      assert.equal(detail.canCancel, false);
      assert.equal(detail.comparison, null);
      assert.equal(
        detail.findings.some(
          (finding) => finding.code === 'core_web_vitals_not_measured',
        ),
        true,
      );

      const severityTotal = Object.values(detail.severityCounts).reduce(
        (sum, value) => sum + value,
        0,
      );
      assert.equal(severityTotal, detail.findings.length);

      const repeated = await service.runWebsiteAuditJob(auditId, {
        fetchPage: site.fetchPage,
        delay: async () => {},
      });
      assert.equal(repeated.status, 'skipped');

      const secondId = await insertQueuedAudit(fixture);
      const secondSite = makeSite();
      const second = await service.runWebsiteAuditJob(secondId, {
        fetchPage: secondSite.fetchPage,
        delay: async () => {},
      });
      assert.equal(second.status, 'completed');

      const compared = await service.getWebsiteAudit(
        fixture.workspaceId,
        secondId,
      );
      assert.ok(compared.comparison);
      assert.equal(compared.comparison.previousAuditId, auditId);
      assert.equal(typeof compared.comparison.delta, 'number');

      const overview = await service.getWebsiteAuditOverview(fixture.workspaceId);
      assert.equal(overview.total, 2);
      assert.equal(overview.completed, 2);
      assert.equal(typeof overview.averageScore, 'number');

      const list = await service.listWebsiteAudits(fixture.workspaceId, {
        page: 1,
        pageSize: 20,
        status: 'completed',
        domain: 'audit.test',
      });
      assert.equal(list.total, 2);
      assert.equal(list.items.length, 2);
    } finally {
      await cleanup(fixture);
    }
  },
);

test(
  'audit creation and cancellation enforce URL safety and isolation',
  { skip },
  async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    try {
      const data = await websiteAuditCreateSchema.validate({
        url: 'audit.test',
      });

      const created = await service.createWebsiteAudit({
        workspaceId: fixture.workspaceId,
        userId: fixture.userId,
        data,
        enqueue: async () => 'job-1',
      });
      assert.equal(created.status, 'queued');
      assert.equal(created.normalizedUrl, 'https://audit.test/');
      assert.equal(created.domain, 'audit.test');

      const queuedDetail = await service.getWebsiteAudit(
        fixture.workspaceId,
        created.id,
      );
      assert.equal(queuedDetail.canCancel, true);
      assert.equal(
        await service.getWebsiteAudit(other.workspaceId, created.id),
        null,
      );

      const otherList = await service.listWebsiteAudits(other.workspaceId, {
        page: 1,
        pageSize: 20,
      });
      assert.equal(otherList.total, 0);
      assert.equal(
        await service.cancelWebsiteAudit({
          workspaceId: other.workspaceId,
          userId: other.userId,
          auditId: created.id,
        }),
        null,
      );

      const cancelled = await service.cancelWebsiteAudit({
        workspaceId: fixture.workspaceId,
        userId: fixture.userId,
        auditId: created.id,
      });
      assert.equal(cancelled.status, 'cancelled');

      await assert.rejects(
        service.cancelWebsiteAudit({
          workspaceId: fixture.workspaceId,
          userId: fixture.userId,
          auditId: created.id,
        }),
        (error) => error.code === 'AUDIT_FINISHED',
      );

      await assert.rejects(
        service.createWebsiteAudit({
          workspaceId: fixture.workspaceId,
          userId: fixture.userId,
          data: await websiteAuditCreateSchema.validate({
            url: 'http://127.0.0.1:3000',
          }),
          enqueue: async () => 'job-2',
        }),
        (error) => error.code === 'INVALID_AUDIT_URL',
      );

      const [countRow] = await query(sql`
        select count(*)::int as value from website_audits
        where workspace_id = ${fixture.workspaceId}
      `);
      assert.equal(countRow.value, 1);

      const queuedFailureId = await insertQueuedAudit(fixture);
      await assert.rejects(
        service.runWebsiteAuditJob(queuedFailureId, {
          fetchPage: async () => {
            throw Object.assign(new Error('The request timed out.'), {
              code: 'timeout',
            });
          },
          delay: async () => {},
        }),
        (error) => error.code === 'timeout',
      );
      const [retryRow] = await query(sql`
        select status, started_at from website_audits where id = ${queuedFailureId}
      `);
      assert.equal(retryRow.status, 'queued');
      assert.equal(retryRow.started_at, null);
    } finally {
      await cleanup(fixture);
      await cleanup(other);
    }
  },
);
