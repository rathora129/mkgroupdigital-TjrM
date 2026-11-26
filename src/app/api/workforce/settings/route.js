import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requireMember, requirePermission } from '@/lib/auth/authorization';
import { permissionsFor } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { updateWorkspaceProfile } from '@/lib/workspace/service';
import { toWorkspaceProfile } from '@/lib/workspace/serialization';
import { workspaceProfileSchema } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requireMember();
    return jsonOk({
      workspace: toWorkspaceProfile(viewer.workspace),
      membership: { role: viewer.membership.role },
      permissions: permissionsFor(viewer.membership.role),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('workspace.edit');
    const body = await readJsonBody(request);
    const changes = await validateBody(workspaceProfileSchema, body);

    const fields = Object.keys(changes);
    if (!fields.length) {
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'There is nothing to update.',
      );
    }

    const workspace = await updateWorkspaceProfile(
      viewer.membership.workspaceId,
      changes,
    );
    if (!workspace) {
      throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
    }

    await recordAudit({
      workspaceId: workspace.id,
      actorUserId: viewer.user.id,
      action: 'workspace.settings_update',
      resourceType: 'workspace',
      resourceId: workspace.id,
      metadata: { fields },
    });

    return jsonOk({ workspace: toWorkspaceProfile(workspace) });
  } catch (error) {
    return errorResponse(error);
  }
}
