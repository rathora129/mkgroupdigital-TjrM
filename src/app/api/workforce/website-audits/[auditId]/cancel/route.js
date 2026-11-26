import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { isUuid } from '@/lib/leads/validation';
import { cancelWebsiteAudit } from '@/lib/audits/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('audits.cancel');

    const limit = rateLimit(`website-audit-cancel:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many cancellations in a short period. Try again shortly.',
      );
    }

    const { auditId } = await params;
    if (!isUuid(auditId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }

    const audit = await cancelWebsiteAudit({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      auditId,
    });
    if (!audit) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }

    return jsonOk({ audit });
  } catch (error) {
    return errorResponse(error);
  }
}
