import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { recordAudit } from '@/lib/audit';
import { sendInvitationEmail } from '@/lib/email/send';
import { rateLimit } from '@/lib/rate-limit';
import { INVITATION_TTL_MS } from '@/lib/workspace/invitations';
import { resendInvitation } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('members.invite');
    const { id } = await params;

    const limit = rateLimit(`invitation-resend:${viewer.user.id}`, {
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

    const workspaceId = viewer.membership.workspaceId;
    const invitation = await resendInvitation({
      workspaceId,
      invitationId: id,
      invitedByUserId: viewer.user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    if (!invitation) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That invitation cannot be resent.',
      );
    }

    await recordAudit({
      workspaceId,
      actorUserId: viewer.user.id,
      action: 'invitation.resend',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { role: invitation.role },
    });

    const baseUrl = process.env.AUTH_URL || request.nextUrl.origin;
    const loginUrl = new URL('/workspace/login', baseUrl);
    loginUrl.searchParams.set('email', invitation.email);

    const delivery = await sendInvitationEmail({
      to: invitation.email,
      role: invitation.role,
      loginUrl: loginUrl.toString(),
    });

    return jsonOk({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: 'pending',
        expiresAt: invitation.expiresAt,
      },
      emailDelivered: delivery.delivered,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
