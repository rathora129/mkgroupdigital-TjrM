import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getAiOverview } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('agents.view');
    const overview = await getAiOverview(viewer.membership.workspaceId);
    return jsonOk(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
