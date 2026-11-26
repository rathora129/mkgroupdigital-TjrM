import { assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { cancelAgentRun } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.run');
    const { runId } = await params;

    const result = await cancelAgentRun({
      workspaceId: viewer.membership.workspaceId,
      runId,
      userId: viewer.user.id,
    });

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
