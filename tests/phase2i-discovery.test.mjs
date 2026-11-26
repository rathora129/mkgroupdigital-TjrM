import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  sql,
  query,
  closeDatabase,
  assertDisposableTestUrl,
} from './support/db.mjs';

// Phase 2I discovery checks: provider mapping, campaign targeting validation,
// dedupe keys and the review pipeline. Database fixtures only run against a
// disposable migrated database (name must end in _test).
const TEST_DATABASE_URL = process.env.PHASE2A_TEST_DATABASE_URL || '';
const skip = TEST_DATABASE_URL
  ? false
  : 'set PHASE2A_TEST_DATABASE_URL to a disposable, migrated database';

const validation = await import('@/lib/discovery/validation');
const providers = await import('@/lib/discovery/providers');
const enrichment = await import('@/lib/discovery/enrichment');

if (TEST_DATABASE_URL) {
  assertDisposableTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const service = await import('@/lib/discovery/service');
const leadService = await import('@/lib/leads/service');

after(async () => {
  await closeDatabase();
});

const fakeEnqueue = async () => 'test-job-id';

const fakeReadiness = {
  ready: true,
  agent: { provider: 'openai', model: 'gpt-4o-mini' },
  model: 'gpt-4o-mini',
};

const fakeGenerate = async () => ({
  data: {
    leadScore: 82,
    temperature: 'hot',
    confidence: 75,
    recommendedService: 'Local SEO',
    reason: 'No website found and strong review signals.',
    pitch: 'Offer a quick local SEO audit.',
    callingApproach: 'Ask about how customers currently find them.',
    qualificationQuestions: ['Who manages the website?', 'How do customers find you?', 'What is your busiest period?'],
    nextAction: 'Call the owner',
  },
  usage: { promptTokens: 10, completionTokens: 20 },
});

function withProviderEnv() {
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
  process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
}

// ---- pure logic -------------------------------------------------------------

test('campaign targeting requires a location, industry, keyword or service', async () => {
  await assert.rejects(
    () =>
      validation.discoveryCampaignCreateSchema.validate(
        { name: 'Empty target' },
        { abortEarly: false },
      ),
    (error) =>
      error.errors.some((message) => message.includes('so discovery has a target')),
  );

  const valid = await validation.discoveryCampaignCreateSchema.validate(
    {
      name: 'Leeds dental',
      provider: 'google_places',
      dailyLimit: 12,
      services: ['Local SEO'],
      criteria: { city: 'Leeds', websitePresence: 'without_website' },
    },
    { abortEarly: false },
  );
  assert.equal(valid.dailyLimit, 12);
  assert.equal(valid.criteria.city, 'Leeds');

  await assert.rejects(
    () =>
      validation.discoveryCampaignCreateSchema.validate(
        {
          name: 'Too many',
          provider: 'google_places',
          dailyLimit: 51,
          criteria: { city: 'Leeds' },
        },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('50 or fewer')),
  );

  await assert.rejects(
    () =>
      validation.discoveryCampaignCreateSchema.validate(
        {
          name: 'Bad provider',
          provider: 'scraper',
          criteria: { city: 'Leeds' },
        },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('supported discovery provider')),
  );
});

test('update schema does not inject defaults that would clobber a campaign', async () => {
  const patch = await validation.discoveryCampaignUpdateSchema.validate(
    { dailyLimit: 10 },
    { abortEarly: false, stripUnknown: true },
  );
  assert.deepEqual(patch, { dailyLimit: 10 });
});

test('review actions are constrained to the supported decision set', async () => {
  const action = await validation.discoveryReviewSchema.validate(
    { action: 'approve', note: 'Looks good' },
    { abortEarly: false },
  );
  assert.equal(action.action, 'approve');

  await assert.rejects(
    () =>
      validation.discoveryReviewSchema.validate(
        { action: 'merge' },
        { abortEarly: false },
      ),
    (error) => error.errors.some((message) => message.includes('valid review action')),
  );
});

test('dedupe keys prefer website, then phone digits, then name and city', () => {
  assert.equal(
    service.prospectDedupeKey({
      website: 'https://www.acme-dental.example/about',
      phone: '0113 000 0000',
    }),
    'site:acme-dental.example',
  );
  assert.equal(
    service.prospectDedupeKey({ phone: '+44 113 000 0000' }),
    'phone:441130000000',
  );
  assert.equal(
    service.prospectDedupeKey({ businessName: 'Acme Dental', city: 'Leeds' }),
    'name:acmedental:leeds',
  );
  assert.equal(service.prospectDedupeKey({ businessName: '' }), null);
});

test('schedules only advance for recurring frequencies', () => {
  const from = new Date('2026-03-01T08:00:00.000Z');
  assert.equal(service.nextRunAtFor('manual', from), null);
  assert.equal(
    service.nextRunAtFor('daily', from).toISOString(),
    '2026-03-02T08:00:00.000Z',
  );
  assert.equal(
    service.nextRunAtFor('weekly', from).toISOString(),
    '2026-03-08T08:00:00.000Z',
  );
});

test('provider metadata reports readiness without leaking secrets', () => {
  withProviderEnv();
  const metadata = providers.listDiscoveryProviderMetadata();
  const google = metadata.find((item) => item.key === 'google_places');
  assert.equal(google.configured, true);
  assert.deepEqual(google.envKeys, ['GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY']);
  assert.equal(JSON.stringify(metadata).includes('test-places-key'), false);

  const savedEndpoint = process.env.DISCOVERY_SEARCH_ENDPOINT;
  delete process.env.DISCOVERY_SEARCH_ENDPOINT;
  try {
    assert.equal(providers.isDiscoveryProviderConfigured('public_web_search'), false);
  } finally {
    if (savedEndpoint) process.env.DISCOVERY_SEARCH_ENDPOINT = savedEndpoint;
  }

  assert.equal(providers.getDiscoveryProviderDefinition('scraper'), null);
  assert.equal(providers.isDiscoveryProviderConfigured('scraper'), false);
});

test('search queries are bounded and only list criteria that exist', () => {
  const search = providers.buildSearchQuery(
    { industry: 'Dentist', city: 'Leeds', websitePresence: 'without_website' },
    ['Local SEO', 'Web design'],
  );
  assert.match(search, /Dentist/);
  assert.match(search, /Local SEO, Web design/);
  assert.match(search, /Leeds/);
  assert.equal(search.length <= 400, true);
});

test('Google Places mapping keeps listing facts and source URLs', () => {
  const mapped = providers.mapGooglePlace({
    displayName: { text: 'Acme Dental' },
    formattedAddress: '1 High Street, Leeds, UK',
    nationalPhoneNumber: '0113 000 0000',
    websiteUri: 'https://acme-dental.example',
    addressComponents: [
      { longText: 'Leeds', types: ['locality'] },
      { longText: 'England', types: ['administrative_area_level_1'] },
      { longText: 'GB', types: ['country'] },
    ],
    primaryTypeDisplayName: { text: 'Dentist' },
    googleMapsUri: 'https://maps.example/place',
    businessStatus: 'OPERATIONAL',
    types: ['dentist'],
  });
  assert.equal(mapped.businessName, 'Acme Dental');
  assert.equal(mapped.city, 'Leeds');
  assert.equal(mapped.state, 'England');
  assert.equal(mapped.industry, 'Dentist');
  assert.equal(mapped.website, 'https://acme-dental.example/');
  assert.equal(mapped.facts.provider, 'google_places');
  assert.equal(mapped.observations.hasWebsite, true);
  assert.ok(mapped.sourceUrls.includes('https://maps.example/place'));
});

test('public web search never invents a company website from a listing URL', () => {
  const mapped = providers.mapWebSearchResult({
    title: 'Bright Smiles',
    url: 'https://directory.example/bright-smiles',
    snippet: 'A dental practice in Leeds.',
    phone: '0113 111 2222',
  });
  assert.equal(mapped.businessName, 'Bright Smiles');
  assert.equal(mapped.website, null);
  assert.equal(mapped.observations.hasWebsite, false);
  assert.deepEqual(mapped.sourceUrls, ['https://directory.example/bright-smiles']);
});

test('AI enrichment output is clamped and labelled as hypotheses', () => {
  const parsed = enrichment.parseEnrichment({
    leadScore: 140,
    temperature: 'scorching',
    confidence: -20,
    recommendedService: 'Local SEO',
    reason: 'No website found and good reviews.',
    pitch: 'Offer a quick SEO audit.',
    callingApproach: 'Ask about their busiest periods.',
    qualificationQuestions: ['Q1', 'Q2', 'Q3', '', 'Q4', 'Q5', 'Q6', 'Q7'],
    nextAction: 'Call the owner',
  });
  assert.equal(parsed.leadScore, 100);
  assert.equal(parsed.confidence, 0);
  assert.equal(parsed.temperature, 'unknown');
  assert.equal(parsed.qualificationQuestions.length, 6);

  const hypotheses = enrichment.hypothesesFor(parsed);
  assert.ok(hypotheses.length >= 2);
  assert.equal(hypotheses.every((item) => item.source === 'ai_analysis'), true);
  assert.equal(enrichment.parseEnrichment(null), null);
});

// ---- database fixtures ------------------------------------------------------

async function createFixture() {
  const suffix = randomUUID();
  const [workspace] = await query(sql`
    insert into workspaces (name, slug)
    values ('Phase 2I discovery', ${`p2i-discovery-${suffix}`})
    returning id
  `);

  const [owner] = await query(sql`
    insert into users (email, name)
    values (${`p2i-discovery-owner-${suffix}@example.test`}, 'Discovery Owner')
    returning id
  `);
  await query(sql`
    insert into workspace_memberships (workspace_id, user_id, role)
    values (${workspace.id}, ${owner.id}, 'owner')
  `);

  return { workspaceId: workspace.id, ownerId: owner.id, suffix };
}

async function cleanup(fixture) {
  await query(
    sql`delete from audit_logs where workspace_id = ${fixture.workspaceId}`,
  );
  await query(sql`delete from workspaces where id = ${fixture.workspaceId}`);
  await query(sql`delete from users where id = ${fixture.ownerId}`);
}

function candidate(businessName, extra = {}) {
  return {
    businessName,
    website: null,
    phone: null,
    email: null,
    contactName: null,
    address: null,
    city: 'Leeds',
    state: null,
    country: 'GB',
    industry: 'Dentist',
    businessSize: null,
    sourceUrls: ['https://listing.example/item'],
    facts: { provider: 'google_places', listedName: businessName },
    observations: { hasWebsite: false },
    ...extra,
  };
}

test('campaign lifecycle locks targeting while active and queues manual runs', { skip }, async () => {
  withProviderEnv();
  const fixture = await createFixture();
  try {
    const created = await service.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        name: 'Leeds dental',
        provider: 'google_places',
        frequency: 'manual',
        dailyLimit: 2,
        maxResearchOps: 10,
        budgetCents: 0,
        services: ['Local SEO'],
        criteria: { city: 'Leeds', industry: 'Dentist' },
      },
    });
    assert.equal(created.status, 'draft');

    const started = await service.startCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
    });
    assert.equal(started.campaign.status, 'active');

    await assert.rejects(
      () =>
        service.updateCampaign({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          campaignId: created.id,
          data: { dailyLimit: 4 },
        }),
      (error) => error.code === 'CAMPAIGN_LOCKED',
    );

    const paused = await service.pauseCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
    });
    assert.equal(paused.campaign.status, 'paused');

    const updated = await service.updateCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      data: { dailyLimit: 3 },
    });
    assert.equal(updated.dailyLimit, 3);

    const resumed = await service.resumeCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
    });
    assert.equal(resumed.campaign.status, 'active');

    const run = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    assert.equal(run.run.status, 'queued');

    await assert.rejects(
      () =>
        service.runCampaignNow({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          campaignId: created.id,
          enqueue: fakeEnqueue,
        }),
      (error) => error.code === 'DISCOVERY_RUN_ACTIVE',
    );
  } finally {
    await cleanup(fixture);
  }
});

test('pipeline dedupes candidates and records provider facts', { skip }, async () => {
  withProviderEnv();
  const fixture = await createFixture();
  try {
    const created = await service.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        name: 'Leeds dental',
        provider: 'google_places',
        frequency: 'daily',
        dailyLimit: 10,
        maxResearchOps: 5,
        budgetCents: 0,
        services: [],
        criteria: { city: 'Leeds' },
      },
    });

    const candidates = [
      candidate('Acme Dental', { phone: '0113 111 2222' }),
      candidate('Acme Dental Ltd', { phone: '0113 111 2222' }),
      candidate('Bright Smiles', { website: 'https://bright-smiles.example' }),
      candidate('Third Practice'),
    ];
    const fakeSearch = async () => candidates;
    const readiness = {
      ready: false,
      reason: 'AI_NOT_CONFIGURED',
      message: 'AI scoring is not configured in this test.',
    };

    const first = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    const result = await service.runDiscoveryPipeline(first.run.id, {
      search: fakeSearch,
      readiness,
    });
    assert.equal(result.status, 'completed');
    assert.equal(result.discovered, 3);
    assert.equal(result.duplicates, 1);

    const pending = await service.listProspects(fixture.workspaceId, {
      page: 1,
      pageSize: 20,
      status: 'pending_review',
    });
    assert.equal(pending.total, 3);
    assert.equal(pending.items.every((item) => item.provider === 'google_places'), true);
    assert.equal(pending.items.every((item) => item.verificationStatus === 'source_derived'), true);

    const second = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    const rerun = await service.runDiscoveryPipeline(second.run.id, {
      search: fakeSearch,
      readiness,
    });
    assert.equal(rerun.discovered, 0);
    assert.equal(rerun.duplicates, 4);
  } finally {
    await cleanup(fixture);
  }
});

test('pipeline stops at the campaign daily limit', { skip }, async () => {
  withProviderEnv();
  const fixture = await createFixture();
  try {
    const created = await service.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        name: 'One a day',
        provider: 'google_places',
        frequency: 'daily',
        dailyLimit: 1,
        maxResearchOps: 5,
        budgetCents: 0,
        services: [],
        criteria: { city: 'Leeds' },
      },
    });

    const fakeSearch = async () => [
      candidate('First Practice', { phone: '0113 100 0001' }),
      candidate('Second Practice', { phone: '0113 100 0002' }),
    ];
    const readiness = { ready: false, reason: 'AI_NOT_CONFIGURED' };

    const first = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    const result = await service.runDiscoveryPipeline(first.run.id, {
      search: fakeSearch,
      readiness,
    });
    assert.equal(result.discovered, 1);

    const second = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    const limited = await service.runDiscoveryPipeline(second.run.id, {
      search: fakeSearch,
      readiness,
    });
    assert.equal(limited.reason, 'daily_limit');
    assert.equal(limited.discovered, 0);
  } finally {
    await cleanup(fixture);
  }
});

test('review actions approve into CRM leads, edit, reject and block duplicates', { skip }, async () => {
  withProviderEnv();
  const fixture = await createFixture();
  try {
    const created = await service.createCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: {
        name: 'Review queue',
        provider: 'google_places',
        frequency: 'manual',
        dailyLimit: 10,
        maxResearchOps: 5,
        budgetCents: 500,
        services: ['Local SEO'],
        criteria: { city: 'Leeds' },
      },
    });
    await service.startCampaign({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
    });

    const run = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    await service.runDiscoveryPipeline(run.run.id, {
      search: async () => [
        candidate('Acme Dental', { phone: '0113 111 2222' }),
        candidate('Bright Smiles', { website: 'https://bright-smiles.example' }),
      ],
      readiness: fakeReadiness,
      generate: fakeGenerate,
    });

    const pending = await service.listProspects(fixture.workspaceId, {
      page: 1,
      pageSize: 20,
      status: 'pending_review',
    });
    assert.equal(pending.total, 2);
    const acme = pending.items.find((item) => item.businessName === 'Acme Dental');
    const bright = pending.items.find((item) => item.businessName === 'Bright Smiles');

    const approved = await service.reviewProspect({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      prospectId: acme.id,
      action: 'approve',
      assignedUserId: fixture.ownerId,
    });
    assert.equal(approved.prospect.status, 'approved');
    assert.equal(approved.lead.companyName, 'Acme Dental');

    const [leadRow] = await query(
      sql`select source, discovery_prospect_id, ai_lead_score
          from leads where id = ${approved.lead.id}`,
    );
    assert.equal(leadRow.source, 'ai_discovery');
    assert.equal(leadRow.discovery_prospect_id, acme.id);
    assert.equal(leadRow.ai_lead_score, 82);

    await assert.rejects(
      () =>
        service.reviewProspect({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          prospectId: acme.id,
          action: 'approve',
        }),
      (error) => error.code === 'PROSPECT_DECIDED',
    );

    const edited = await service.reviewProspect({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      prospectId: bright.id,
      action: 'edit',
      values: {
        recommendedService: 'Web design',
        temperature: 'warm',
        leadScore: 71,
        confidence: 65,
        qualificationQuestions: ['Who owns the website?'],
      },
    });
    assert.equal(edited.prospect.status, 'pending_review');
    assert.equal(edited.prospect.recommendedService, 'Web design');
    assert.equal(edited.prospect.temperature, 'warm');

    const rejected = await service.reviewProspect({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      prospectId: bright.id,
      action: 'reject',
      note: 'Not a fit for our services.',
    });
    assert.equal(rejected.prospect.status, 'rejected');

    // Duplicate protection: approve refuses when a matching lead already exists.
    const duplicateRun = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    await service.runDiscoveryPipeline(duplicateRun.run.id, {
      search: async () => [candidate('Acme Dental', { phone: '0113 111 2222' })],
      readiness: fakeReadiness,
      generate: fakeGenerate,
    });
    // The dedupe index already holds Acme's key, so create a fresh name that
    // still matches the existing lead by company name.
    const existingLead = await leadService.createLead({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      data: { companyName: 'Duplicate Practice', source: 'other' },
    });
    const duplicateProspect = await service.getProspect(fixture.workspaceId, bright.id);
    assert.equal(duplicateProspect.linkedLead, null);

    const clashRun = await service.runCampaignNow({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      campaignId: created.id,
      enqueue: fakeEnqueue,
    });
    await service.runDiscoveryPipeline(clashRun.run.id, {
      search: async () => [candidate('Duplicate Practice', { phone: '0113 999 0000' })],
      readiness: fakeReadiness,
      generate: fakeGenerate,
    });
    const clashList = await service.listProspects(fixture.workspaceId, {
      page: 1,
      pageSize: 20,
      status: 'pending_review',
      search: 'Duplicate Practice',
    });
    assert.equal(clashList.total, 1);

    await assert.rejects(
      () =>
        service.reviewProspect({
          workspaceId: fixture.workspaceId,
          userId: fixture.ownerId,
          prospectId: clashList.items[0].id,
          action: 'approve',
        }),
      (error) => error.code === 'POSSIBLE_DUPLICATE_LEAD',
    );

    const marked = await service.reviewProspect({
      workspaceId: fixture.workspaceId,
      userId: fixture.ownerId,
      prospectId: clashList.items[0].id,
      action: 'mark_duplicate',
      duplicateLeadId: existingLead.lead.id,
      note: 'Existing client record.',
    });
    assert.equal(marked.prospect.status, 'duplicate');
    assert.equal(marked.prospect.leadId, existingLead.lead.id);
  } finally {
    await cleanup(fixture);
  }
});
