import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listProspects } from '@/lib/discovery/service';
import { discoveryProspectQuerySchema } from '@/lib/discovery/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('discovery.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(discoveryProspectQuerySchema, search);

    const prospects = await listProspects(viewer.membership.workspaceId, query);
    return jsonOk(prospects);
  } catch (error) {
    return errorResponse(error);
  }
}
