import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { archiveAgent, getAgent, updateAgent } from '@/lib/ai/runtime';
import { agentUpdateSchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('agents.view');
    const { agentId } = await params;
    const agent = await getAgent(viewer.membership.workspaceId, agentId);
    if (!agent) {
      throw new ApiError(404, 'NOT_FOUND', 'That agent could not be found.');
    }
    return jsonOk({ agent });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.manage');
    const { agentId } = await params;
    const body = await readJsonBody(request);
    const data = await validateBody(agentUpdateSchema, body);

    const agent = await updateAgent({
      workspaceId: viewer.membership.workspaceId,
      agentId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ agent });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.manage');
    const { agentId } = await params;

    const agent = await archiveAgent({
      workspaceId: viewer.membership.workspaceId,
      agentId,
      userId: viewer.user.id,
    });

    return jsonOk({ agent });
  } catch (error) {
    return errorResponse(error);
  }
}
