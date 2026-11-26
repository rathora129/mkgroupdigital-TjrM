import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { canAssignRole } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail } from '@/lib/auth/hash';
import { sendInvitationEmail } from '@/lib/email/send';
import { rateLimit } from '@/lib/rate-limit';
import { INVITATION_TTL_MS } from '@/lib/workspace/invitations';
import {
  findMemberByEmail,
  listInvitations,
  upsertInvitation,
} from '@/lib/workspace/service';
import { inviteSchema } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('members.invite');
    const invitations = await listInvitations(
      viewer.membership.workspaceId,
    );
    return jsonOk({ invitations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('members.invite');

    const limit = rateLimit(`invitation:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many invitations in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const { email, role } = await validateBody(inviteSchema, body);

    if (!canAssignRole(viewer.membership.role, role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your role cannot invite someone with that role.',
      );
    }

    const address = normalizeEmail(email);
    const workspaceId = viewer.membership.workspaceId;

    const existingMember = await findMemberByEmail(workspaceId, address);
    if (existingMember) {
      throw new ApiError(
        409,
        'ALREADY_MEMBER',
        'That email already belongs to a workspace member.',
      );
    }

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await upsertInvitation({
      workspaceId,
      email: address,
      role,
      invitedByUserId: viewer.user.id,
      expiresAt,
    });

    if (!invitation) {
      throw new ApiError(
        500,
        'INVITATION_FAILED',
        'The invitation could not be created.',
      );
    }

    await recordAudit({
      workspaceId,
      actorUserId: viewer.user.id,
      action: 'invitation.create',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { role: invitation.role },
    });

    const baseUrl = process.env.AUTH_URL || request.nextUrl.origin;
    const loginUrl = new URL('/workspace/login', baseUrl);
    loginUrl.searchParams.set('email', address);

    const delivery = await sendInvitationEmail({
      to: address,
      role: invitation.role,
      loginUrl: loginUrl.toString(),
    });

    return jsonOk(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
        emailDelivered: delivery.delivered,
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
