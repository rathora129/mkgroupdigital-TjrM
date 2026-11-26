import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import {
  agents,
  leads,
  opportunities,
  opportunityDiscoveries,
  opportunityRequirementItems,
  proposalActivity,
  proposalApprovals,
  proposalDeliverables,
  proposalLineItems,
  proposalMilestones,
  proposalResponses,
  proposalSections,
  proposalVersions,
  proposals,
  serviceCategories,
  services,
  users,
  workspaceMemberships,
  workspaces,
} from '@/db/schema';
import { createAgentRun } from '@/lib/ai/runtime';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import { computeProposal } from './calc';
import {
  RECURRING_BILLING_TYPES,
  SECTION_KEYS,
  SECTION_LABELS,
} from './validation';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 14;

export function addDays(days) {
  return new Date(Date.now() + days * DAY_MS);
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

// A validity date stays valid through the end of that day, so history is only
// read as expired once the following day has begun.
export function isExpired(version) {
  if (!version?.validityDate) return false;
  const date = new Date(version.validityDate);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() + DAY_MS <= Date.now();
}

export function displayStatus(status, validityDate) {
  if (status === 'approved' || status === 'sent') {
    if (isExpired({ validityDate })) return 'expired';
  }
  return status;
}

function isUniqueViolation(error) {
  return (
    error?.code === '23505' ||
    error?.cause?.code === '23505' ||
    /duplicate key|unique constraint/i.test(error?.message || '')
  );
}

async function runAtomic(build) {
  const db = getDb();
  if (getDbDriver() === 'node-postgres') {
    return db.transaction(build);
  }
  // The Neon HTTP driver has no interactive transactions; statements run
  // sequentially. Every statement is still workspace- and status-guarded.
  return build(db);
}

async function insertActivity({
  workspaceId,
  proposalId,
  versionId = null,
  userId,
  type,
  body = null,
  metadata = null,
}) {
  await getDb().insert(proposalActivity).values({
    workspaceId,
    proposalId,
    versionId,
    actorUserId: userId || null,
    type,
    body,
    metadata,
  });
}

async function assertMember(workspaceId, userId) {
  if (!userId) return null;
  const rows = await getDb()
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'ASSIGNEE_NOT_MEMBER',
      'That person is not a member of this workspace.',
      { salesOwnerUserId: 'Choose a workspace member.' },
    );
  }
  return userId;
}

async function loadServiceMap(workspaceId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({
      id: services.id,
      name: services.name,
      categoryName: serviceCategories.name,
      regulated: services.regulated,
      reviewProfession: services.reviewProfession,
      reviewNotes: services.reviewNotes,
    })
    .from(services)
    .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(and(eq(services.workspaceId, workspaceId), inArray(services.id, unique)));

  const map = new Map(rows.map((row) => [row.id, row]));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      422,
      'SERVICE_NOT_FOUND',
      'Choose services from this workspace catalogue.',
      { serviceId: 'One or more selected services are unavailable.' },
    );
  }
  return map;
}

function lineValues(workspaceId, versionId, item, computed, serviceMap, order) {
  const snapshot = item.serviceId ? serviceMap.get(item.serviceId) : null;
  return {
    workspaceId,
    versionId,
    serviceId: item.serviceId || null,
    serviceName: snapshot?.name || null,
    serviceCategoryName: snapshot?.categoryName || null,
    regulated: Boolean(snapshot?.regulated),
    reviewProfession: snapshot?.reviewProfession || null,
    reviewNotes: snapshot?.reviewNotes || null,
    name: item.name,
    description: item.description ?? null,
    scope: item.scope ?? null,
    quantity: computed.quantity,
    unit: item.unit || 'unit',
    unitPriceCents: computed.unitPriceCents,
    discountType: item.discountType || 'none',
    discountValue: item.discountValue ?? 0,
    taxScheme: item.taxScheme || 'none',
    taxRateBps: item.taxRateBps ?? 0,
    billingType: item.billingType || 'one_time',
    startCondition: item.startCondition ?? null,
    billingNotes: item.billingNotes ?? null,
    minimumCommitmentMonths: item.minimumCommitmentMonths ?? null,
    kind: item.kind || 'included',
    lineSubtotalCents: computed.lineSubtotalCents,
    lineDiscountCents: computed.lineDiscountCents,
    lineNetCents: computed.lineNetCents,
    lineTaxCents: computed.lineTaxCents,
    lineTotalCents: computed.lineTotalCents,
    displayOrder: order,
  };
}

function totalsPatch(calc) {
  return {
    subtotalCents: calc.totals.subtotalCents,
    itemDiscountCents: calc.totals.itemDiscountCents,
    proposalDiscountCents: calc.totals.proposalDiscountCents,
    discountTotalCents: calc.totals.discountTotalCents,
    taxableCents: calc.totals.taxableCents,
    taxCents: calc.totals.taxCents,
    grandTotalCents: calc.totals.grandTotalCents,
    oneTimeTotalCents: calc.totals.oneTimeTotalCents,
    recurringMonthlyCents: calc.totals.recurringMonthlyCents,
    recurringQuarterlyCents: calc.totals.recurringQuarterlyCents,
    recurringAnnualCents: calc.totals.recurringAnnualCents,
    optionalTotalCents: calc.totals.optionalTotalCents,
    cgstCents: calc.totals.cgstCents,
    sgstCents: calc.totals.sgstCents,
    igstCents: calc.totals.igstCents,
  };
}

async function insertContent(
  executor,
  { workspaceId, versionId, items, sections, deliverables, milestones, calc, serviceMap },
) {
  if (items.length > 0) {
    const rows = items.map((item, index) =>
      lineValues(workspaceId, versionId, item, calc.lines[index], serviceMap, index),
    );
    await executor.insert(proposalLineItems).values(rows);
  }

  await executor.insert(proposalSections).values(
    SECTION_KEYS.map((key, index) => ({
      workspaceId,
      versionId,
      sectionKey: key,
      content: sections?.[key] ?? null,
      displayOrder: index,
    })),
  );

  if (deliverables.length > 0) {
    await executor.insert(proposalDeliverables).values(
      deliverables.map((entry, index) => ({
        workspaceId,
        versionId,
        serviceId: entry.serviceId || null,
        title: entry.title,
        description: entry.description ?? null,
        expectedCompletion: entry.expectedCompletion ?? null,
        displayOrder: entry.displayOrder ?? index,
      })),
    );
  }

  if (milestones.length > 0) {
    await executor.insert(proposalMilestones).values(
      milestones.map((entry, index) => ({
        workspaceId,
        versionId,
        serviceId: entry.serviceId || null,
        title: entry.title,
        description: entry.description ?? null,
        expectedCompletion: entry.expectedCompletion ?? null,
        displayOrder: entry.displayOrder ?? index,
      })),
    );
  }
}

async function nextReference(workspaceId) {
  const rows = await getDb()
    .select({
      value: sql`coalesce(max(cast(substring(${proposals.reference} from 6) as integer)), 0)`,
    })
    .from(proposals)
    .where(eq(proposals.workspaceId, workspaceId));
  const next = Number(rows[0]?.value || 0) + 1;
  return `PROP-${String(next).padStart(4, '0')}`;
}

async function insertProposalRow(values) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const reference = await nextReference(values.workspaceId);
    try {
      const rows = await getDb()
        .insert(proposals)
        .values({ ...values, reference })
        .returning({ id: proposals.id, reference: proposals.reference });
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 5) continue;
      throw error;
    }
  }
  throw new ApiError(
    409,
    'REFERENCE_CONFLICT',
    'The proposal reference could not be reserved. Try again.',
  );
}

function prefillSections(discovery, requirementItems) {
  const sections = {};
  if (discovery && discovery.status === 'approved') {
    const parts = [
      discovery.companyOverview,
      discovery.industry ? `Industry: ${discovery.industry}` : null,
      discovery.businessModel,
    ].filter(Boolean);
    if (parts.length) sections.businessUnderstanding = parts.join('\n\n');
    if (discovery.expectedOutcomes) {
      sections.objectives = discovery.expectedOutcomes;
    }
    if (discovery.timeline) sections.estimatedTimeline = discovery.timeline;
    if (discovery.specialRequirements) {
      sections.assumptions = discovery.specialRequirements;
    }
  }

  const confirmed = requirementItems.filter((item) => item.status === 'confirmed');
  if (confirmed.length > 0) {
    sections.scopeOfWork = confirmed
      .map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ''}`)
      .join('\n');
    const names = [
      ...new Set(confirmed.map((item) => item.serviceName).filter(Boolean)),
    ];
    if (names.length) sections.servicesIncluded = names.map((name) => `- ${name}`).join('\n');
  }

  return sections;
}

export async function createProposal({ workspaceId, userId, data }) {
  const opportunityRows = await getDb()
    .select({
      id: opportunities.id,
      leadId: opportunities.leadId,
      title: opportunities.title,
      currency: opportunities.currency,
      ownerUserId: opportunities.ownerUserId,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, workspaceId),
        eq(opportunities.id, data.opportunityId),
      ),
    )
    .limit(1);

  const opportunity = opportunityRows[0];
  if (!opportunity) {
    throw new ApiError(
      422,
      'OPPORTUNITY_NOT_FOUND',
      'That opportunity does not exist in this workspace.',
      { opportunityId: 'Choose an opportunity from this workspace.' },
    );
  }

  const salesOwnerUserId =
    data.salesOwnerUserId === undefined
      ? opportunity.ownerUserId ?? userId
      : data.salesOwnerUserId;
  await assertMember(workspaceId, salesOwnerUserId);

  const [discoveryRows, requirementRows] = await Promise.all([
    getDb()
      .select()
      .from(opportunityDiscoveries)
      .where(
        and(
          eq(opportunityDiscoveries.workspaceId, workspaceId),
          eq(opportunityDiscoveries.opportunityId, opportunity.id),
        ),
      )
      .limit(1),
    getDb()
      .select({
        id: opportunityRequirementItems.id,
        serviceId: opportunityRequirementItems.serviceId,
        name: opportunityRequirementItems.name,
        description: opportunityRequirementItems.description,
        status: opportunityRequirementItems.status,
        serviceName: services.name,
        categoryName: serviceCategories.name,
        regulated: services.regulated,
        reviewProfession: services.reviewProfession,
        reviewNotes: services.reviewNotes,
      })
      .from(opportunityRequirementItems)
      .leftJoin(services, eq(services.id, opportunityRequirementItems.serviceId))
      .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
      .where(
        and(
          eq(opportunityRequirementItems.workspaceId, workspaceId),
          eq(opportunityRequirementItems.opportunityId, opportunity.id),
        ),
      )
      .orderBy(asc(opportunityRequirementItems.sortOrder)),
  ]);

  const discovery = discoveryRows[0] || null;
  const confirmed = requirementRows.filter((item) => item.status === 'confirmed');
  const usePrefill = data.prefill !== false;

  const items = usePrefill
    ? confirmed.map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        description: item.description,
        quantity: 1,
        unit: 'unit',
        unitPriceCents: 0,
        kind: 'included',
        billingType: 'one_time',
      }))
    : [];
  const sections = usePrefill ? prefillSections(discovery, requirementRows) : {};
  const calc = computeProposal({ items });
  const serviceMap = usePrefill
    ? new Map(
        confirmed
          .filter((item) => item.serviceId)
          .map((item) => [
            item.serviceId,
            {
              name: item.serviceName,
              categoryName: item.categoryName,
              regulated: item.regulated,
              reviewProfession: item.reviewProfession,
              reviewNotes: item.reviewNotes,
            },
          ]),
      )
    : new Map();

  const proposalRow = await insertProposalRow({
    workspaceId,
    leadId: opportunity.leadId,
    opportunityId: opportunity.id,
    title: data.title || `${opportunity.title} proposal`,
    status: 'draft',
    salesOwnerUserId,
    createdByUserId: userId,
    updatedByUserId: userId,
  });

  try {
    await runAtomic(async (executor) => {
      const versionRows = await executor
        .insert(proposalVersions)
        .values({
          workspaceId,
          proposalId: proposalRow.id,
          versionNumber: 1,
          status: 'draft',
          changeSummary: 'Initial draft.',
          currency: opportunity.currency || 'INR',
          validityDate: data.validityDate ?? addDays(30),
          proposalDiscountType: 'none',
          proposalDiscountValue: 0,
          createdByUserId: userId,
          updatedByUserId: userId,
          ...totalsPatch(calc),
        })
        .returning({ id: proposalVersions.id });

      const versionId = versionRows[0].id;

      await insertContent(executor, {
        workspaceId,
        versionId,
        items,
        sections,
        deliverables: [],
        milestones: [],
        calc,
        serviceMap,
      });

      await executor
        .update(proposals)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(proposals.id, proposalRow.id));
    });
  } catch (error) {
    await getDb().delete(proposals).where(eq(proposals.id, proposalRow.id));
    throw error;
  }

  await insertActivity({
    workspaceId,
    proposalId: proposalRow.id,
    userId,
    type: 'created',
    body: usePrefill && confirmed.length
      ? `Draft created from the opportunity with ${confirmed.length} confirmed requirement${confirmed.length === 1 ? '' : 's'}.`
      : 'Draft created from the opportunity.',
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.create',
    resourceType: 'proposal',
    resourceId: proposalRow.id,
    metadata: {
      opportunityId: opportunity.id,
      reference: proposalRow.reference,
      prefilledItems: items.length,
    },
  });

  return getProposal(workspaceId, proposalRow.id);
}

const PROPOSAL_SELECT = {
  id: proposals.id,
  workspaceId: proposals.workspaceId,
  reference: proposals.reference,
  title: proposals.title,
  status: proposals.status,
  leadId: proposals.leadId,
  opportunityId: proposals.opportunityId,
  currentVersionId: proposals.currentVersionId,
  salesOwnerUserId: proposals.salesOwnerUserId,
  salesOwnerName: users.name,
  salesOwnerEmail: users.email,
  createdAt: proposals.createdAt,
  updatedAt: proposals.updatedAt,
  opportunityTitle: opportunities.title,
  opportunityStage: opportunities.stage,
  currency: opportunities.currency,
  companyName: leads.companyName,
  contactName: leads.contactName,
  leadEmail: leads.email,
  versionNumber: proposalVersions.versionNumber,
  versionStatus: proposalVersions.status,
  validityDate: proposalVersions.validityDate,
  grandTotalCents: proposalVersions.grandTotalCents,
  oneTimeTotalCents: proposalVersions.oneTimeTotalCents,
  recurringMonthlyCents: proposalVersions.recurringMonthlyCents,
  recurringQuarterlyCents: proposalVersions.recurringQuarterlyCents,
  recurringAnnualCents: proposalVersions.recurringAnnualCents,
  optionalTotalCents: proposalVersions.optionalTotalCents,
  versionCurrency: proposalVersions.currency,
};

const PROPOSAL_JOINS = (query) =>
  query
    .innerJoin(opportunities, eq(opportunities.id, proposals.opportunityId))
    .innerJoin(leads, eq(leads.id, proposals.leadId))
    .leftJoin(users, eq(users.id, proposals.salesOwnerUserId))
    .leftJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId));

function proposalOrder(sort, direction) {
  const dir = direction === 'asc' ? asc : desc;
  switch (sort) {
    case 'updated':
      return dir(proposals.updatedAt);
    case 'validity':
      return direction === 'asc'
        ? sql`${proposalVersions.validityDate} asc nulls last`
        : sql`${proposalVersions.validityDate} desc nulls last`;
    case 'value':
      return direction === 'asc'
        ? sql`${proposalVersions.grandTotalCents} asc nulls last`
        : sql`${proposalVersions.grandTotalCents} desc nulls last`;
    case 'status':
      return dir(proposals.status);
    default:
      return dir(proposals.createdAt);
  }
}

function proposalFilters(workspaceId, query, viewerUserId) {
  const filters = [eq(proposals.workspaceId, workspaceId)];

  if (query.status) filters.push(eq(proposals.status, query.status));
  if (query.opportunityId) {
    filters.push(eq(proposals.opportunityId, query.opportunityId));
  }

  if (query.owner === 'me') {
    filters.push(eq(proposals.salesOwnerUserId, viewerUserId));
  } else if (query.owner === 'unassigned') {
    filters.push(isNull(proposals.salesOwnerUserId));
  } else if (query.owner) {
    filters.push(eq(proposals.salesOwnerUserId, query.owner));
  }

  if (query.validity === 'expired') {
    filters.push(
      and(
        inArray(proposals.status, ['approved', 'sent']),
        isNotNull(proposalVersions.validityDate),
        lte(proposalVersions.validityDate, new Date(Date.now() - DAY_MS)),
      ),
    );
  } else if (query.validity === 'expiring') {
    filters.push(
      and(
        inArray(proposals.status, ['approved', 'sent']),
        isNotNull(proposalVersions.validityDate),
        gt(proposalVersions.validityDate, new Date(Date.now() - DAY_MS)),
        lte(proposalVersions.validityDate, addDays(EXPIRING_DAYS)),
      ),
    );
  }

  if (query.search) {
    const like = `%${escapeLike(query.search)}%`;
    filters.push(
      or(
        ilike(proposals.title, like),
        ilike(proposals.reference, like),
        ilike(opportunities.title, like),
        ilike(leads.companyName, like),
        ilike(leads.contactName, like),
        ilike(leads.email, like),
      ),
    );
  }

  return and(...filters);
}

function listRow(row) {
  return {
    ...row,
    displayStatus: displayStatus(row.status, row.validityDate),
    isEditable: row.status === 'draft',
  };
}

export async function listProposals(workspaceId, viewerUserId, query) {
  const db = getDb();
  const where = proposalFilters(workspaceId, query, viewerUserId);
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totals] = await Promise.all([
    PROPOSAL_JOINS(db.select(PROPOSAL_SELECT).from(proposals))
      .where(where)
      .orderBy(proposalOrder(query.sort, query.direction))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(proposals)
      .innerJoin(opportunities, eq(opportunities.id, proposals.opportunityId))
      .innerJoin(leads, eq(leads.id, proposals.leadId))
      .leftJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(where),
  ]);

  const total = Number(totals[0]?.value || 0);
  return {
    items: rows.map(listRow),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listProposalsForOpportunity(workspaceId, opportunityId) {
  const rows = await PROPOSAL_JOINS(
    getDb().select(PROPOSAL_SELECT).from(proposals),
  )
    .where(
      and(
        eq(proposals.workspaceId, workspaceId),
        eq(proposals.opportunityId, opportunityId),
      ),
    )
    .orderBy(desc(proposals.createdAt));
  return rows.map(listRow);
}

export async function listProposalOpportunityOptions(workspaceId) {
  return getDb()
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      currency: opportunities.currency,
      ownerUserId: opportunities.ownerUserId,
      companyName: leads.companyName,
      contactName: leads.contactName,
    })
    .from(opportunities)
    .innerJoin(leads, eq(leads.id, opportunities.leadId))
    .where(eq(opportunities.workspaceId, workspaceId))
    .orderBy(desc(opportunities.updatedAt))
    .limit(300);
}

async function loadProposalContext(workspaceId, proposalId) {
  const rows = await getDb()
    .select()
    .from(proposals)
    .where(
      and(eq(proposals.workspaceId, workspaceId), eq(proposals.id, proposalId)),
    )
    .limit(1);
  const proposal = rows[0];
  if (!proposal) return null;
  if (!proposal.currentVersionId) {
    throw new ApiError(
      409,
      'PROPOSAL_INCOMPLETE',
      'This proposal has no current version. Create a revision to continue.',
    );
  }
  const versionRows = await getDb()
    .select()
    .from(proposalVersions)
    .where(
      and(
        eq(proposalVersions.workspaceId, workspaceId),
        eq(proposalVersions.id, proposal.currentVersionId),
      ),
    )
    .limit(1);
  if (!versionRows[0]) {
    throw new ApiError(
      409,
      'PROPOSAL_INCOMPLETE',
      'This proposal version could not be loaded. Create a revision to continue.',
    );
  }
  return { proposal, version: versionRows[0] };
}

export async function getProposal(workspaceId, proposalId) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;
  const db = getDb();

  const [proposalRows, versions, items, sectionRows, deliverables, milestones, approvals, responses, activity] =
    await Promise.all([
      PROPOSAL_JOINS(db.select(PROPOSAL_SELECT).from(proposals))
        .where(
          and(
            eq(proposals.workspaceId, workspaceId),
            eq(proposals.id, proposalId),
          ),
        )
        .limit(1),
      db
        .select({
          id: proposalVersions.id,
          versionNumber: proposalVersions.versionNumber,
          status: proposalVersions.status,
          changeSummary: proposalVersions.changeSummary,
          previousVersionId: proposalVersions.previousVersionId,
          currency: proposalVersions.currency,
          validityDate: proposalVersions.validityDate,
          grandTotalCents: proposalVersions.grandTotalCents,
          recurringMonthlyCents: proposalVersions.recurringMonthlyCents,
          recurringQuarterlyCents: proposalVersions.recurringQuarterlyCents,
          recurringAnnualCents: proposalVersions.recurringAnnualCents,
          createdByUserId: proposalVersions.createdByUserId,
          approvedByUserId: proposalVersions.approvedByUserId,
          approvedAt: proposalVersions.approvedAt,
          sentAt: proposalVersions.sentAt,
          respondedAt: proposalVersions.respondedAt,
          createdAt: proposalVersions.createdAt,
          updatedAt: proposalVersions.updatedAt,
        })
        .from(proposalVersions)
        .where(
          and(
            eq(proposalVersions.workspaceId, workspaceId),
            eq(proposalVersions.proposalId, proposalId),
          ),
        )
        .orderBy(desc(proposalVersions.versionNumber)),
      db
        .select()
        .from(proposalLineItems)
        .where(
          and(
            eq(proposalLineItems.workspaceId, workspaceId),
            eq(proposalLineItems.versionId, version.id),
          ),
        )
        .orderBy(asc(proposalLineItems.displayOrder)),
      db
        .select()
        .from(proposalSections)
        .where(
          and(
            eq(proposalSections.workspaceId, workspaceId),
            eq(proposalSections.versionId, version.id),
          ),
        )
        .orderBy(asc(proposalSections.displayOrder)),
      db
        .select()
        .from(proposalDeliverables)
        .where(
          and(
            eq(proposalDeliverables.workspaceId, workspaceId),
            eq(proposalDeliverables.versionId, version.id),
          ),
        )
        .orderBy(asc(proposalDeliverables.displayOrder)),
      db
        .select()
        .from(proposalMilestones)
        .where(
          and(
            eq(proposalMilestones.workspaceId, workspaceId),
            eq(proposalMilestones.versionId, version.id),
          ),
        )
        .orderBy(asc(proposalMilestones.displayOrder)),
      db
        .select({
          id: proposalApprovals.id,
          versionId: proposalApprovals.versionId,
          decision: proposalApprovals.decision,
          notes: proposalApprovals.notes,
          actorUserId: proposalApprovals.actorUserId,
          createdAt: proposalApprovals.createdAt,
        })
        .from(proposalApprovals)
        .where(
          and(
            eq(proposalApprovals.workspaceId, workspaceId),
            eq(proposalApprovals.proposalId, proposalId),
          ),
        )
        .orderBy(desc(proposalApprovals.createdAt)),
      db
        .select()
        .from(proposalResponses)
        .where(
          and(
            eq(proposalResponses.workspaceId, workspaceId),
            eq(proposalResponses.proposalId, proposalId),
          ),
        )
        .orderBy(desc(proposalResponses.createdAt)),
      db
        .select()
        .from(proposalActivity)
        .where(
          and(
            eq(proposalActivity.workspaceId, workspaceId),
            eq(proposalActivity.proposalId, proposalId),
          ),
        )
        .orderBy(desc(proposalActivity.createdAt))
        .limit(100),
    ]);

  const userIds = new Set();
  for (const entry of versions) {
    if (entry.createdByUserId) userIds.add(entry.createdByUserId);
    if (entry.approvedByUserId) userIds.add(entry.approvedByUserId);
  }
  for (const entry of approvals) if (entry.actorUserId) userIds.add(entry.actorUserId);
  for (const entry of responses) if (entry.actorUserId) userIds.add(entry.actorUserId);
  for (const entry of activity) if (entry.actorUserId) userIds.add(entry.actorUserId);

  const userRows = userIds.size
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, [...userIds]))
    : [];
  const userMap = new Map(userRows.map((row) => [row.id, row]));

  const sections = {};
  for (const key of SECTION_KEYS) sections[key] = null;
  for (const row of sectionRows) sections[row.sectionKey] = row.content;

  const calc = computeProposal({
    items: items.map((item) => ({
      ...item,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    })),
    proposalDiscountType: version.proposalDiscountType,
    proposalDiscountValue: version.proposalDiscountValue,
  });

  return {
    proposal: proposalRows[0] || listRow({
      ...proposal,
      salesOwnerName: null,
      salesOwnerEmail: null,
      opportunityTitle: null,
      opportunityStage: null,
      companyName: null,
      contactName: null,
      leadEmail: null,
      versionNumber: version.versionNumber,
      versionStatus: version.status,
      validityDate: version.validityDate,
      grandTotalCents: version.grandTotalCents,
    }),
    currentVersion: {
      ...version,
      displayStatus: displayStatus(version.status, version.validityDate),
      isEditable: version.status === 'draft',
      isExpired: isExpired(version),
    },
    versions: versions.map((entry) => ({
      ...entry,
      displayStatus: displayStatus(entry.status, entry.validityDate),
      isCurrent: entry.id === proposal.currentVersionId,
      createdByName: userMap.get(entry.createdByUserId)?.name || null,
      createdByEmail: userMap.get(entry.createdByUserId)?.email || null,
      approvedByName: userMap.get(entry.approvedByUserId)?.name || null,
      approvedByEmail: userMap.get(entry.approvedByUserId)?.email || null,
    })),
    items,
    sections,
    deliverables,
    milestones,
    approvals: approvals.map((entry) => ({
      ...entry,
      actorName: userMap.get(entry.actorUserId)?.name || null,
      actorEmail: userMap.get(entry.actorUserId)?.email || null,
    })),
    response: responses.find((entry) => entry.versionId === version.id) || null,
    responses,
    activity: activity.map((entry) => ({
      ...entry,
      actorName: userMap.get(entry.actorUserId)?.name || null,
      actorEmail: userMap.get(entry.actorUserId)?.email || null,
    })),
    calc,
  };
}

export async function updateProposalDetails({
  workspaceId,
  userId,
  proposalId,
  data,
}) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;

  if (data.salesOwnerUserId !== undefined) {
    await assertMember(workspaceId, data.salesOwnerUserId);
  }

  const changes = {};
  if (data.title !== undefined) changes.title = data.title;
  if (data.salesOwnerUserId !== undefined) {
    changes.salesOwnerUserId = data.salesOwnerUserId;
  }
  if (Object.keys(changes).length === 0) {
    return getProposal(workspaceId, proposalId);
  }

  await getDb()
    .update(proposals)
    .set({ ...changes, updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(eq(proposals.workspaceId, workspaceId), eq(proposals.id, proposalId)),
    );

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: context.version.id,
    userId,
    type: 'updated',
    body: `Proposal details updated: ${Object.keys(changes).join(', ')}.`,
    metadata: { fields: Object.keys(changes) },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.update',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { fields: Object.keys(changes) },
  });

  return getProposal(workspaceId, proposalId);
}

function staleError() {
  return new ApiError(
    409,
    'STALE_PROPOSAL',
    'This proposal changed while you were editing it. Reload and try again.',
  );
}

function versionLockedError() {
  return new ApiError(
    409,
    'VERSION_LOCKED',
    'Only a draft version can be edited. Create a revision to make changes.',
  );
}

export async function saveDraftContent({
  workspaceId,
  userId,
  proposalId,
  data,
}) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status !== 'draft') throw versionLockedError();

  const items = data.items || [];
  const deliverables = data.deliverables || [];
  const milestones = data.milestones || [];
  const serviceMap = await loadServiceMap(workspaceId, [
    ...items.map((item) => item.serviceId),
    ...deliverables.map((entry) => entry.serviceId),
    ...milestones.map((entry) => entry.serviceId),
  ]);

  const calc = computeProposal({
    items,
    proposalDiscountType: data.proposalDiscountType,
    proposalDiscountValue: data.proposalDiscountValue,
  });
  const expected = new Date(data.expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw staleError();

  const patch = {
    currency: data.currency,
    validityDate: data.validityDate ?? null,
    proposalDiscountType: data.proposalDiscountType,
    proposalDiscountValue: data.proposalDiscountValue,
    changeSummary: data.changeSummary ?? version.changeSummary,
    updatedByUserId: userId,
    updatedAt: new Date(),
    ...totalsPatch(calc),
  };

  const previousCount = Number(
    (
      await getDb()
        .select({ value: count() })
        .from(proposalLineItems)
        .where(
          and(
            eq(proposalLineItems.workspaceId, workspaceId),
            eq(proposalLineItems.versionId, version.id),
          ),
        )
    )[0]?.value || 0,
  );

  const mutate = async (executor) => {
    const updated = await executor
      .update(proposalVersions)
      .set(patch)
      .where(
        and(
          eq(proposalVersions.workspaceId, workspaceId),
          eq(proposalVersions.id, version.id),
          eq(proposalVersions.status, 'draft'),
          // Postgres keeps microsecond precision while the browser only sees
          // milliseconds, so compare within the millisecond the client saw.
          gte(proposalVersions.updatedAt, expected),
          lt(proposalVersions.updatedAt, new Date(expected.getTime() + 1)),
        ),
      )
      .returning({ id: proposalVersions.id });
    if (!updated[0]) {
      throw version.status === 'draft' ? staleError() : versionLockedError();
    }

    await executor
      .delete(proposalLineItems)
      .where(
        and(
          eq(proposalLineItems.workspaceId, workspaceId),
          eq(proposalLineItems.versionId, version.id),
        ),
      );
    await executor
      .delete(proposalSections)
      .where(
        and(
          eq(proposalSections.workspaceId, workspaceId),
          eq(proposalSections.versionId, version.id),
        ),
      );
    await executor
      .delete(proposalDeliverables)
      .where(
        and(
          eq(proposalDeliverables.workspaceId, workspaceId),
          eq(proposalDeliverables.versionId, version.id),
        ),
      );
    await executor
      .delete(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.workspaceId, workspaceId),
          eq(proposalMilestones.versionId, version.id),
        ),
      );

    await insertContent(executor, {
      workspaceId,
      versionId: version.id,
      items,
      sections: data.sections || {},
      deliverables,
      milestones,
      calc,
      serviceMap,
    });
  };

  if (getDbDriver() === 'node-postgres') {
    await getDb().transaction(mutate);
  } else {
    await mutate(getDb());
  }

  await getDb()
    .update(proposals)
    .set({ status: 'draft', updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(proposals.id, proposal.id));

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: version.id,
    userId,
    type: 'draft_saved',
    body: `Draft saved with ${items.length} line item${items.length === 1 ? '' : 's'}.`,
    metadata: {
      itemsBefore: previousCount,
      itemsAfter: items.length,
      proposalDiscountCents: calc.totals.proposalDiscountCents,
    },
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.content_update',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: {
      versionId: version.id,
      itemsBefore: previousCount,
      itemsAfter: items.length,
      discountType: data.proposalDiscountType,
    },
  });

  return getProposal(workspaceId, proposalId);
}

export async function submitProposal({ workspaceId, userId, proposalId }) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status !== 'draft') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Only a draft can be submitted for internal review.',
    );
  }

  const includedRows = await getDb()
    .select({ value: count() })
    .from(proposalLineItems)
    .where(
      and(
        eq(proposalLineItems.workspaceId, workspaceId),
        eq(proposalLineItems.versionId, version.id),
        eq(proposalLineItems.kind, 'included'),
      ),
    );
  if (Number(includedRows[0]?.value || 0) === 0) {
    throw new ApiError(
      422,
      'PROPOSAL_INCOMPLETE',
      'Add at least one included line before submitting for review.',
      { items: 'A proposal needs at least one included line.' },
    );
  }

  const updated = await getDb()
    .update(proposalVersions)
    .set({ status: 'internal_review', updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(proposalVersions.workspaceId, workspaceId),
        eq(proposalVersions.id, version.id),
        eq(proposalVersions.status, 'draft'),
      ),
    )
    .returning({ id: proposalVersions.id });
  if (!updated[0]) {
    throw new ApiError(409, 'INVALID_STATE', 'This proposal is no longer a draft.');
  }

  await getDb()
    .update(proposals)
    .set({ status: 'internal_review', updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(proposals.id, proposal.id));

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: version.id,
    userId,
    type: 'submitted',
    body: `Version ${version.versionNumber} submitted for internal review.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.submit',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { versionId: version.id, versionNumber: version.versionNumber },
  });

  return getProposal(workspaceId, proposalId);
}

export async function decideProposal({
  workspaceId,
  userId,
  proposalId,
  decision,
  notes = null,
}) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status !== 'internal_review') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'This version is not awaiting an internal review decision.',
    );
  }

  if (decision === 'changes_requested' && !notes) {
    throw new ApiError(
      422,
      'NOTES_REQUIRED',
      'Explain what needs to change before returning the draft.',
      { notes: 'Add a note for the preparer.' },
    );
  }

  const isApproval = decision === 'approved';
  const updated = await getDb()
    .update(proposalVersions)
    .set({
      status: isApproval ? 'approved' : 'draft',
      approvedByUserId: isApproval ? userId : null,
      approvedAt: isApproval ? new Date() : null,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(proposalVersions.workspaceId, workspaceId),
        eq(proposalVersions.id, version.id),
        eq(proposalVersions.status, 'internal_review'),
      ),
    )
    .returning({ id: proposalVersions.id });
  if (!updated[0]) {
    throw new ApiError(409, 'INVALID_STATE', 'This version changed while you decided.');
  }

  await getDb().insert(proposalApprovals).values({
    workspaceId,
    proposalId,
    versionId: version.id,
    decision,
    notes: notes ?? null,
    actorUserId: userId,
  });

  await getDb()
    .update(proposals)
    .set({
      status: isApproval ? 'approved' : 'draft',
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: version.id,
    userId,
    type: isApproval ? 'approved' : 'changes_requested',
    body: isApproval
      ? `Version ${version.versionNumber} approved.`
      : `Changes requested on version ${version.versionNumber}.`,
    metadata: notes ? { notes } : null,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: isApproval ? 'proposal.approve' : 'proposal.reject',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { versionId: version.id, versionNumber: version.versionNumber },
  });

  return getProposal(workspaceId, proposalId);
}

export async function markProposalSent({ workspaceId, userId, proposalId }) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status === 'sent') {
    return { ...(await getProposal(workspaceId, proposalId)), changed: false };
  }
  if (version.status !== 'approved') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Only an approved version can be marked as sent.',
    );
  }
  if (isExpired(version)) {
    throw new ApiError(
      409,
      'VALIDITY_EXPIRED',
      'This version has passed its validity date. Create a revision before sending.',
    );
  }

  const updated = await getDb()
    .update(proposalVersions)
    .set({ status: 'sent', sentAt: new Date(), updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(proposalVersions.workspaceId, workspaceId),
        eq(proposalVersions.id, version.id),
        eq(proposalVersions.status, 'approved'),
      ),
    )
    .returning({ id: proposalVersions.id });
  if (!updated[0]) {
    throw new ApiError(409, 'INVALID_STATE', 'This version changed while you sent it.');
  }

  await getDb()
    .update(proposals)
    .set({ status: 'sent', updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(proposals.id, proposal.id));

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: version.id,
    userId,
    type: 'sent',
    body: `Version ${version.versionNumber} marked as sent. No email was sent automatically.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.send',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { versionId: version.id, versionNumber: version.versionNumber },
  });

  return { ...(await getProposal(workspaceId, proposalId)), changed: true };
}

export async function recordProposalResponse({
  workspaceId,
  userId,
  proposalId,
  response,
  notes = null,
}) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status === 'accepted' || version.status === 'rejected') {
    if (version.status === response) {
      return { ...(await getProposal(workspaceId, proposalId)), changed: false };
    }
    throw new ApiError(
      409,
      'RESPONSE_RECORDED',
      'A response has already been recorded for this version.',
    );
  }
  if (version.status !== 'sent') {
    throw new ApiError(
      409,
      'INVALID_STATE',
      'Record a response only after the proposal has been marked as sent.',
    );
  }

  const updated = await getDb()
    .update(proposalVersions)
    .set({
      status: response,
      respondedAt: new Date(),
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(proposalVersions.workspaceId, workspaceId),
        eq(proposalVersions.id, version.id),
        eq(proposalVersions.status, 'sent'),
      ),
    )
    .returning({ id: proposalVersions.id });
  if (!updated[0]) {
    throw new ApiError(409, 'INVALID_STATE', 'This version changed while you recorded the response.');
  }

  try {
    await getDb().insert(proposalResponses).values({
      workspaceId,
      proposalId,
      versionId: version.id,
      response,
      notes: notes ?? null,
      actorUserId: userId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'RESPONSE_RECORDED',
        'A response has already been recorded for this version.',
      );
    }
    throw error;
  }

  await getDb()
    .update(proposals)
    .set({ status: response, updatedByUserId: userId, updatedAt: new Date() })
    .where(eq(proposals.id, proposal.id));

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: version.id,
    userId,
    type: response === 'accepted' ? 'accepted' : 'rejected',
    body: `Client ${response} version ${version.versionNumber}.`,
    metadata: notes ? { notes } : null,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.response',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { versionId: version.id, response },
  });

  return { ...(await getProposal(workspaceId, proposalId)), changed: true };
}

export async function createProposalRevision({
  workspaceId,
  userId,
  proposalId,
  changeSummary = null,
}) {
  const context = await loadProposalContext(workspaceId, proposalId);
  if (!context) return null;
  const { proposal, version } = context;

  if (version.status === 'draft') {
    throw new ApiError(
      409,
      'DRAFT_EXISTS',
      'This proposal already has an editable draft. Edit it instead of creating a revision.',
    );
  }

  const [maxRows, items, sectionRows, deliverables, milestones] = await Promise.all([
    getDb()
      .select({ value: sql`coalesce(max(${proposalVersions.versionNumber}), 0)` })
      .from(proposalVersions)
      .where(
        and(
          eq(proposalVersions.workspaceId, workspaceId),
          eq(proposalVersions.proposalId, proposalId),
        ),
      ),
    getDb()
      .select()
      .from(proposalLineItems)
      .where(
        and(
          eq(proposalLineItems.workspaceId, workspaceId),
          eq(proposalLineItems.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalLineItems.displayOrder)),
    getDb()
      .select()
      .from(proposalSections)
      .where(
        and(
          eq(proposalSections.workspaceId, workspaceId),
          eq(proposalSections.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalSections.displayOrder)),
    getDb()
      .select()
      .from(proposalDeliverables)
      .where(
        and(
          eq(proposalDeliverables.workspaceId, workspaceId),
          eq(proposalDeliverables.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalDeliverables.displayOrder)),
    getDb()
      .select()
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.workspaceId, workspaceId),
          eq(proposalMilestones.versionId, version.id),
        ),
      )
      .orderBy(asc(proposalMilestones.displayOrder)),
  ]);

  const versionNumber = Number(maxRows[0]?.value || 0) + 1;
  const itemInputs = items.map((item) => ({
    ...item,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
  }));
  const calc = computeProposal({
    items: itemInputs,
    proposalDiscountType: version.proposalDiscountType,
    proposalDiscountValue: version.proposalDiscountValue,
  });

  const newVersionId = await runAtomic(async (executor) => {
    let rows;
    try {
      rows = await executor
        .insert(proposalVersions)
        .values({
          workspaceId,
          proposalId,
          versionNumber,
          status: 'draft',
          changeSummary:
            changeSummary || `Revision of version ${version.versionNumber}.`,
          previousVersionId: version.id,
          currency: version.currency,
          validityDate: version.validityDate,
          proposalDiscountType: version.proposalDiscountType,
          proposalDiscountValue: version.proposalDiscountValue,
          createdByUserId: userId,
          updatedByUserId: userId,
          ...totalsPatch(calc),
        })
        .returning({ id: proposalVersions.id });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'Another revision was created at the same time. Reload and try again.',
        );
      }
      throw error;
    }

    const id = rows[0].id;

    if (items.length > 0) {
      await executor.insert(proposalLineItems).values(
        items.map((item, index) => ({
          workspaceId,
          versionId: id,
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          serviceCategoryName: item.serviceCategoryName,
          regulated: item.regulated,
          reviewProfession: item.reviewProfession,
          reviewNotes: item.reviewNotes,
          name: item.name,
          description: item.description,
          scope: item.scope,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceCents: item.unitPriceCents,
          discountType: item.discountType,
          discountValue: item.discountValue,
          taxScheme: item.taxScheme,
          taxRateBps: item.taxRateBps,
          billingType: item.billingType,
          startCondition: item.startCondition,
          billingNotes: item.billingNotes,
          minimumCommitmentMonths: item.minimumCommitmentMonths,
          kind: item.kind,
          lineSubtotalCents: calc.lines[index].lineSubtotalCents,
          lineDiscountCents: calc.lines[index].lineDiscountCents,
          lineNetCents: calc.lines[index].lineNetCents,
          lineTaxCents: calc.lines[index].lineTaxCents,
          lineTotalCents: calc.lines[index].lineTotalCents,
          displayOrder: index,
        })),
      );
    }

    if (sectionRows.length > 0) {
      await executor.insert(proposalSections).values(
        sectionRows.map((row) => ({
          workspaceId,
          versionId: id,
          sectionKey: row.sectionKey,
          content: row.content,
          displayOrder: row.displayOrder,
        })),
      );
    }

    if (deliverables.length > 0) {
      await executor.insert(proposalDeliverables).values(
        deliverables.map((row) => ({
          workspaceId,
          versionId: id,
          serviceId: row.serviceId,
          title: row.title,
          description: row.description,
          expectedCompletion: row.expectedCompletion,
          displayOrder: row.displayOrder,
        })),
      );
    }

    if (milestones.length > 0) {
      await executor.insert(proposalMilestones).values(
        milestones.map((row) => ({
          workspaceId,
          versionId: id,
          serviceId: row.serviceId,
          title: row.title,
          description: row.description,
          expectedCompletion: row.expectedCompletion,
          displayOrder: row.displayOrder,
        })),
      );
    }

    await executor
      .update(proposals)
      .set({
        currentVersionId: id,
        status: 'draft',
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id));

    return id;
  });

  await insertActivity({
    workspaceId,
    proposalId,
    versionId: newVersionId,
    userId,
    type: 'version_created',
    body: `Version ${versionNumber} created from version ${version.versionNumber}.`,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.version_create',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { fromVersion: version.versionNumber, toVersion: versionNumber },
  });

  return getProposal(workspaceId, proposalId);
}

export async function getProposalOverview(workspaceId) {
  const db = getDb();
  const now = Date.now();

  const [grouped, expiringRows, expiredRows] = await Promise.all([
    db
      .select({
        status: proposals.status,
        currency: proposalVersions.currency,
        value: count(),
        grandTotalCents: sql`coalesce(sum(${proposalVersions.grandTotalCents}), 0)`,
        monthlyCents: sql`coalesce(sum(${proposalVersions.recurringMonthlyCents}), 0)`,
        quarterlyCents: sql`coalesce(sum(${proposalVersions.recurringQuarterlyCents}), 0)`,
        annualCents: sql`coalesce(sum(${proposalVersions.recurringAnnualCents}), 0)`,
        acceptedCents: sql`coalesce(sum(case when ${proposals.status} = 'accepted' then ${proposalVersions.grandTotalCents} else 0 end), 0)`,
      })
      .from(proposals)
      .leftJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(eq(proposals.workspaceId, workspaceId))
      .groupBy(proposals.status, proposalVersions.currency),
    db
      .select({ value: count() })
      .from(proposals)
      .leftJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(
        and(
          eq(proposals.workspaceId, workspaceId),
          inArray(proposals.status, ['approved', 'sent']),
          isNotNull(proposalVersions.validityDate),
          gt(proposalVersions.validityDate, new Date(now - DAY_MS)),
          lte(proposalVersions.validityDate, addDays(EXPIRING_DAYS)),
        ),
      ),
    db
      .select({ value: count() })
      .from(proposals)
      .leftJoin(proposalVersions, eq(proposalVersions.id, proposals.currentVersionId))
      .where(
        and(
          eq(proposals.workspaceId, workspaceId),
          inArray(proposals.status, ['approved', 'sent']),
          isNotNull(proposalVersions.validityDate),
          lte(proposalVersions.validityDate, new Date(now - DAY_MS)),
        ),
      ),
  ]);

  const statusCounts = {};
  const currencyTotals = new Map();
  for (const row of grouped) {
    const amount = Number(row.value || 0);
    statusCounts[row.status] = (statusCounts[row.status] || 0) + amount;

    const currency = row.currency || 'INR';
    const entry = currencyTotals.get(currency) || {
      currency,
      count: 0,
      valueCents: 0,
      acceptedCents: 0,
      monthlyCents: 0,
      quarterlyCents: 0,
      annualCents: 0,
    };
    entry.count += amount;
    if (['approved', 'sent', 'accepted'].includes(row.status)) {
      entry.valueCents += Number(row.grandTotalCents || 0);
      entry.monthlyCents += Number(row.monthlyCents || 0);
      entry.quarterlyCents += Number(row.quarterlyCents || 0);
      entry.annualCents += Number(row.annualCents || 0);
    }
    entry.acceptedCents += Number(row.acceptedCents || 0);
    currencyTotals.set(currency, entry);
  }

  const pipeline = [...currencyTotals.values()];
  const primary = pipeline.find((entry) => entry.currency === 'INR') || pipeline[0] || null;
  const total = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);

  return {
    total,
    draft: statusCounts.draft || 0,
    internalReview: statusCounts.internal_review || 0,
    approved: statusCounts.approved || 0,
    sent: statusCounts.sent || 0,
    accepted: statusCounts.accepted || 0,
    rejected: statusCounts.rejected || 0,
    expiring: Number(expiringRows[0]?.value || 0),
    expired: Number(expiredRows[0]?.value || 0),
    currencies: pipeline.length,
    proposalValueCents: primary?.valueCents || 0,
    acceptedValueCents: primary?.acceptedCents || 0,
    recurringMonthlyCents: primary?.monthlyCents || 0,
    recurringQuarterlyCents: primary?.quarterlyCents || 0,
    recurringAnnualCents: primary?.annualCents || 0,
    currency: primary?.currency || 'INR',
  };
}

const PRICING_GROUPS = [
  { key: 'one_time', label: 'One-time services' },
  { key: 'monthly', label: 'Recurring — monthly' },
  { key: 'quarterly', label: 'Recurring — quarterly' },
  { key: 'annual', label: 'Recurring — annual' },
];

function money(cents, currency) {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(cents || 0) / 100);
  } catch {
    return `${currency || ''} ${(Number(cents || 0) / 100).toFixed(2)}`.trim();
  }
}

function dateOnly(value) {
  if (!value) return 'Not set';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toISOString().slice(0, 10);
}

export async function buildProposalDocument(workspaceId, proposalId) {
  const detail = await getProposal(workspaceId, proposalId);
  if (!detail) return null;

  const workspaceRows = await getDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const workspace = workspaceRows[0] || null;

  const { proposal, currentVersion: version, sections, items, deliverables, milestones, calc } =
    detail;

  const groups = PRICING_GROUPS.map((group) => ({
    ...group,
    lines: calc.periods[group.key].totalCents > 0 || group.key === 'one_time'
      ? items.filter(
          (item) =>
            item.kind === 'included' &&
            (group.key === 'one_time'
              ? !RECURRING_BILLING_TYPES.includes(item.billingType)
              : item.billingType === group.key),
        )
      : [],
    totals: calc.periods[group.key],
  })).filter((group) => group.lines.length > 0);

  const optionalLines = items.filter((item) => item.kind === 'optional');
  const excludedLines = items.filter((item) => item.kind === 'excluded');

  const disclosures = items
    .filter((item) => item.regulated)
    .map((item) => ({
      line: item.name,
      profession: item.reviewProfession || 'A qualified professional',
      notes: item.reviewNotes || null,
    }));

  const sectionList = SECTION_KEYS.filter((key) => sections[key]).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    content: sections[key],
  }));

  const summary = {
    reference: proposal.reference,
    versionNumber: version.versionNumber,
    displayStatus: currentVersionStatus(detail),
    currency: version.currency,
    validityDate: version.validityDate,
    oneTimeTotalCents: calc.totals.oneTimeTotalCents,
    recurringMonthlyCents: calc.totals.recurringMonthlyCents,
    recurringQuarterlyCents: calc.totals.recurringQuarterlyCents,
    recurringAnnualCents: calc.totals.recurringAnnualCents,
    optionalTotalCents: calc.totals.optionalTotalCents,
  };

  return {
    generatedAt: new Date(),
    reference: proposal.reference,
    versionNumber: version.versionNumber,
    status: version.status,
    displayStatus: currentVersionStatus(detail),
    isClientFacing: ['approved', 'sent', 'accepted', 'rejected'].includes(version.status),
    workspace: workspace
      ? {
          name: workspace.name,
          businessEmail: workspace.businessEmail,
          businessPhone: workspace.businessPhone,
          businessAddress: workspace.businessAddress,
          websiteUrl: workspace.websiteUrl,
          brandColor: workspace.brandColor,
          logoUrl: workspace.logoUrl,
        }
      : null,
    proposal: {
      reference: proposal.reference,
      title: proposal.title,
      salesOwnerName: proposal.salesOwnerName || proposal.salesOwnerEmail || null,
      createdAt: proposal.createdAt,
    },
    client: {
      companyName: proposal.companyName,
      contactName: proposal.contactName,
      email: proposal.leadEmail,
      opportunityId: proposal.opportunityId,
      opportunityTitle: proposal.opportunityTitle,
    },
    version: {
      versionNumber: version.versionNumber,
      currency: version.currency,
      validityDate: version.validityDate,
      approvedAt: version.approvedAt,
      sentAt: version.sentAt,
    },
    sections: sectionList,
    deliverables,
    milestones,
    groups,
    optionalLines,
    excludedLines,
    summary,
    disclosures,
    notice:
      'This document is a commercial proposal. It does not certify, sign, file or otherwise perform any regulated professional service. Statutory review, signatures and filings are handled separately by the named professional.',
  };
}

function currentVersionStatus(detail) {
  return detail.currentVersion.displayStatus;
}

export function proposalDocumentText(document) {
  const lines = [
    `${document.proposal.reference} — version ${document.versionNumber}`,
    `Status: ${document.displayStatus}`,
    `${document.proposal.title}`,
    `Client: ${document.client.companyName || 'Not recorded'}`,
    `Contact: ${document.client.contactName || 'Not recorded'}`,
    `Valid until: ${dateOnly(document.version.validityDate)}`,
    '',
  ];

  for (const section of document.sections) {
    lines.push(section.label.toUpperCase(), section.content, '');
  }

  for (const group of document.groups) {
    lines.push(group.label.toUpperCase());
    for (const item of group.lines) {
      lines.push(
        `- ${item.name} · ${item.quantity} ${item.unit} × ${money(item.unitPriceCents, document.version.currency)} = ${money(item.lineTotalCents, document.version.currency)}`,
      );
    }
    lines.push(
      `Subtotal ${money(group.totals.subtotalCents, document.version.currency)} · Discounts ${money(group.totals.discountTotalCents, document.version.currency)} · Tax ${money(group.totals.taxCents, document.version.currency)} · Total ${money(group.totals.totalCents, document.version.currency)}`,
      '',
    );
  }

  if (document.disclosures.length > 0) {
    lines.push('REGULATED SERVICES');
    for (const entry of document.disclosures) {
      lines.push(`- ${entry.line}: professional review by ${entry.profession}.`);
    }
    lines.push('');
  }

  lines.push(document.notice);
  return lines.join('\n');
}

export async function recordProposalExport({ workspaceId, userId, proposalId }) {
  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.export',
    resourceType: 'proposal',
    resourceId: proposalId,
  });
}

export async function requestProposalAiDraft({
  workspaceId,
  userId,
  proposalId,
  instruction = null,
}) {
  const detail = await getProposal(workspaceId, proposalId);
  if (!detail) return null;

  if (detail.currentVersion.status !== 'draft') {
    throw new ApiError(
      409,
      'VERSION_LOCKED',
      'AI drafting is available only for a draft version.',
    );
  }

  const document = await buildProposalDocument(workspaceId, proposalId);
  const documentText = proposalDocumentText(document);

  const agentRows = await getDb()
    .select({ id: agents.id, name: agents.name, type: agents.type })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.enabled, true),
        isNull(agents.archivedAt),
        inArray(agents.type, ['sales_assistant', 'proposal_generator']),
      ),
    )
    .orderBy(
      sql`case when ${agents.type} = 'proposal_generator' then 0 else 1 end`,
      asc(agents.name),
    )
    .limit(1);

  const agent = agentRows[0];
  if (!agent) {
    throw new ApiError(
      409,
      'AI_AGENT_REQUIRED',
      'Add an enabled Proposal Generator or Sales Assistant agent in AI Workforce before requesting an AI draft.',
    );
  }

  const prompt = [
    'Draft client-facing narrative sections for this proposal from the saved records below.',
    'Label everything you produce as an AI-generated draft for a human to review.',
    'Do not approve, send or accept the proposal, and never confirm payment or client acceptance.',
    'Do not invent prices, taxes, discounts, billing commitments or timelines. Use only values present in the record; leave gaps blank and list them as questions.',
    'Statutory professional review, signatures and filings are outside AI scope.',
    instruction ? `Additional instruction: ${instruction}` : null,
    '',
    documentText,
  ]
    .filter((line) => line !== null)
    .join('\n')
    .slice(0, 20_000);

  const { run, reused } = await createAgentRun({
    workspaceId,
    agentId: agent.id,
    userId,
    input: prompt,
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'proposal.ai_draft',
    resourceType: 'proposal',
    resourceId: proposalId,
    metadata: { agentId: agent.id, runId: run.id, reused },
  });

  return {
    run: { id: run.id, status: run.status, approvalRequired: run.approvalRequired },
    agent,
    reused,
  };
}

export async function listProposalOwners(workspaceId) {
  return getDb()
    .select({ userId: workspaceMemberships.userId, name: users.name, email: users.email })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, workspaceId))
    .orderBy(asc(users.name));
}

export { money as formatProposalMoney, dateOnly as formatProposalDate };
