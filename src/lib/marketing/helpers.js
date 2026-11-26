import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  clients,
  marketingCampaigns,
  marketingContentItems,
  marketingWebsitePages,
  marketingWebsiteProposals,
  projects,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';

export { assertMembers, escapeLike, staleError } from '@/lib/clients/helpers';

export function marketingNotFound(label = 'record') {
  return new ApiError(
    404,
    'NOT_FOUND',
    `That ${label} could not be found in this workspace.`,
  );
}

export async function assertClient(workspaceId, clientId, { required = true } = {}) {
  if (!clientId && !required) return null;
  if (!clientId) {
    throw new ApiError(422, 'CLIENT_REQUIRED', 'Choose a client.', {
      clientId: 'Choose a client.',
    });
  }
  const rows = await getDb()
    .select({
      id: clients.id,
      reference: clients.reference,
      companyName: clients.companyName,
      website: clients.website,
      industry: clients.industry,
      status: clients.status,
      ownerUserId: clients.ownerUserId,
    })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  const client = rows[0];
  if (!client) {
    throw new ApiError(
      422,
      'CLIENT_NOT_FOUND',
      'Choose a client that belongs to this workspace.',
      { clientId: 'Choose a client from this workspace.' },
    );
  }
  return client;
}

export async function assertProject(workspaceId, projectId, clientId = null) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({
      id: projects.id,
      reference: projects.reference,
      name: projects.name,
      clientId: projects.clientId,
      status: projects.status,
    })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
    )
    .limit(1);
  const project = rows[0];
  if (!project) {
    throw new ApiError(
      422,
      'PROJECT_NOT_FOUND',
      'Choose a project that belongs to this workspace.',
      { projectId: 'Choose a project from this workspace.' },
    );
  }
  if (clientId && project.clientId && project.clientId !== clientId) {
    throw new ApiError(
      422,
      'PROJECT_CLIENT_MISMATCH',
      'That project belongs to a different client.',
      { projectId: 'Choose a project for the selected client.' },
    );
  }
  return project;
}

export async function assertCampaign(workspaceId, campaignId, clientId = null) {
  if (!campaignId) return null;
  const rows = await getDb()
    .select({
      id: marketingCampaigns.id,
      clientId: marketingCampaigns.clientId,
      name: marketingCampaigns.name,
      status: marketingCampaigns.status,
    })
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.workspaceId, workspaceId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .limit(1);
  const campaign = rows[0];
  if (!campaign) {
    throw new ApiError(
      422,
      'CAMPAIGN_NOT_FOUND',
      'Choose a campaign that belongs to this workspace.',
      { campaignId: 'Choose a campaign from this workspace.' },
    );
  }
  if (clientId && campaign.clientId !== clientId) {
    throw new ApiError(
      422,
      'CAMPAIGN_CLIENT_MISMATCH',
      'That campaign belongs to a different client.',
      { campaignId: 'Choose a campaign for the selected client.' },
    );
  }
  return campaign;
}

export async function assertContentItem(workspaceId, contentId) {
  const rows = await getDb()
    .select()
    .from(marketingContentItems)
    .where(
      and(
        eq(marketingContentItems.workspaceId, workspaceId),
        eq(marketingContentItems.id, contentId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) throw marketingNotFound('content item');
  return item;
}

export async function assertPage(workspaceId, pageId, clientId = null) {
  if (!pageId) return null;
  const rows = await getDb()
    .select()
    .from(marketingWebsitePages)
    .where(
      and(
        eq(marketingWebsitePages.workspaceId, workspaceId),
        eq(marketingWebsitePages.id, pageId),
      ),
    )
    .limit(1);
  const page = rows[0];
  if (!page) {
    throw new ApiError(
      422,
      'PAGE_NOT_FOUND',
      'Choose a page that belongs to this client.',
      { pageId: 'Choose a page from this client inventory.' },
    );
  }
  if (clientId && page.clientId !== clientId) {
    throw new ApiError(
      422,
      'PAGE_CLIENT_MISMATCH',
      'That page belongs to a different client.',
      { pageId: 'Choose a page for the selected client.' },
    );
  }
  return page;
}

export async function assertProposal(workspaceId, proposalId) {
  const rows = await getDb()
    .select()
    .from(marketingWebsiteProposals)
    .where(
      and(
        eq(marketingWebsiteProposals.workspaceId, workspaceId),
        eq(marketingWebsiteProposals.id, proposalId),
      ),
    )
    .limit(1);
  const proposal = rows[0];
  if (!proposal) throw marketingNotFound('website change proposal');
  return proposal;
}

export function assertDateOrder(start, end, startField = 'periodStart') {
  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    throw new ApiError(422, 'INVALID_DATE_RANGE', 'The end date must be on or after the start date.', {
      [startField]: 'The end date must be on or after the start date.',
    });
  }
}

export async function listClientOptions(workspaceId) {
  return getDb()
    .select({
      id: clients.id,
      reference: clients.reference,
      companyName: clients.companyName,
      status: clients.status,
    })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(asc(clients.companyName))
    .limit(500);
}

export async function listProjectOptions(workspaceId, clientId = null) {
  const filters = [eq(projects.workspaceId, workspaceId)];
  if (clientId) filters.push(eq(projects.clientId, clientId));
  return getDb()
    .select({
      id: projects.id,
      reference: projects.reference,
      name: projects.name,
      clientId: projects.clientId,
      status: projects.status,
    })
    .from(projects)
    .where(and(...filters))
    .orderBy(asc(projects.name))
    .limit(500);
}
