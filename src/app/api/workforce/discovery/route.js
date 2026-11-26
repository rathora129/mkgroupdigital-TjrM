import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import {
  createCampaign,
  getDiscoveryOverview,
  getDiscoveryReadiness,
  listCampaigns,
} from '@/lib/discovery/service';
import {
  discoveryCampaignCreateSchema,
  discoveryCampaignQuerySchema,
} from '@/lib/discovery/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('discovery.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(discoveryCampaignQuerySchema, search);

    const workspaceId = viewer.membership.workspaceId;
    const [campaigns, overview, readiness] = await Promise.all([
      listCampaigns(workspaceId, query),
      getDiscoveryOverview(workspaceId),
      getDiscoveryReadiness(workspaceId),
    ]);

    return jsonOk({ campaigns, overview, readiness });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('discovery.manage');

    const limit = rateLimit(`discovery-create:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many campaigns created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    const data = await validateBody(discoveryCampaignCreateSchema, body);

    const campaign = await createCampaign({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ campaign }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
