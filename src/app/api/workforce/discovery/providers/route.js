import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getDiscoveryReadiness } from '@/lib/discovery/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('discovery.view');
    const readiness = await getDiscoveryReadiness(viewer.membership.workspaceId);
    return jsonOk(readiness);
  } catch (error) {
    return errorResponse(error);
  }
}
