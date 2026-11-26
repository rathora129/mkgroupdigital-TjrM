import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { canActOnMember, canAssignRole } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import {
  changeMemberRole,
  getMembershipById,
  removeMember,
} from '@/lib/workspace/service';
import { memberRoleSchema } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('members.manage');
    const { id } = await params;
    const body = await readJsonBody(request);
    const { role } = await validateBody(memberRoleSchema, body);

    const workspaceId = viewer.membership.workspaceId;
    const target = await getMembershipById(workspaceId, id);
    if (!target) {
      throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    }
    if (!canActOnMember(viewer.membership.role, target.role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only an owner can change the owner’s access.',
      );
    }
    if (!canAssignRole(viewer.membership.role, role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your role cannot grant that role.',
      );
    }

    if (target.role === role) {
      return jsonOk({ member: { id: target.id, role: target.role } });
    }

    const result = await changeMemberRole({
      workspaceId,
      membershipId: id,
      role,
    });

    if (result.status === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    }
    if (result.status === 'last_owner') {
      await recordAudit({
        workspaceId,
        actorUserId: viewer.user.id,
        action: 'membership.role_update',
        resourceType: 'membership',
        resourceId: id,
        success: false,
        metadata: { from: result.member.role, to: role, reason: 'last_owner' },
      });
      throw new ApiError(
        409,
        'LAST_OWNER',
        'The workspace must keep at least one owner.',
      );
    }

    await recordAudit({
      workspaceId,
      actorUserId: viewer.user.id,
      action: 'membership.role_update',
      resourceType: 'membership',
      resourceId: id,
      metadata: { from: result.member.role, to: role },
    });

    return jsonOk({
      member: { id: result.updated.id, role: result.updated.role },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('members.manage');
    const { id } = await params;

    const workspaceId = viewer.membership.workspaceId;
    const target = await getMembershipById(workspaceId, id);
    if (!target) {
      throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    }
    if (!canActOnMember(viewer.membership.role, target.role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only an owner can remove an owner.',
      );
    }

    const result = await removeMember(workspaceId, id);

    if (result.status === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', 'Member not found.');
    }
    if (result.status === 'last_owner') {
      await recordAudit({
        workspaceId,
        actorUserId: viewer.user.id,
        action: 'membership.remove',
        resourceType: 'membership',
        resourceId: id,
        success: false,
        metadata: {
          role: result.member.role,
          self: result.member.userId === viewer.user.id,
          reason: 'last_owner',
        },
      });
      throw new ApiError(
        409,
        'LAST_OWNER',
        'The workspace must keep at least one owner.',
      );
    }

    await recordAudit({
      workspaceId,
      actorUserId: viewer.user.id,
      action: 'membership.remove',
      resourceType: 'membership',
      resourceId: id,
      metadata: {
        role: result.member.role,
        self: result.member.userId === viewer.user.id,
      },
    });

    return jsonOk({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
