import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { issueInvoice } from '@/lib/billing/service';
import { isUuid } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That invoice could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('invoices.issue');
    const { invoiceId } = await params;
    if (!isUuid(invoiceId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`invoice-issue:${viewer.user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many issuances. Try again shortly.');
    }

    const result = await issueInvoice({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      invoiceId,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
