import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { leadAccessFor } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';
import { listLeadCalls, logCall } from '@/lib/sales/service';
import { callLogSchema } from '@/lib/sales/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('leads.view');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    const calls = await listLeadCalls({
      workspaceId: viewer.membership.workspaceId,
      leadId,
      access: leadAccessFor(viewer),
    });
    if (calls === null) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk({ items: calls });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('calls.log');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const limit = rateLimit(`lead-call:${viewer.user.id}`, {
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many call logs in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const data = await validateBody(callLogSchema, body);

    const result = await logCall({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      leadId,
      data,
      access: leadAccessFor(viewer),
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
