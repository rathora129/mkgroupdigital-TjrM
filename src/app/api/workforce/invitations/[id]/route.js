import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { recordAudit } from '@/lib/audit';
import { revokeInvitation } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('members.invite');
    const { id } = await params;
    const workspaceId = viewer.membership.workspaceId;

    const revoked = await revokeInvitation(workspaceId, id);
    if (!revoked) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That invitation is no longer pending.',
      );
    }

    await recordAudit({
      workspaceId,
      actorUserId: viewer.user.id,
      action: 'invitation.revoke',
      resourceType: 'invitation',
      resourceId: id,
      metadata: { role: revoked.role },
    });

    return jsonOk({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
