import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import { cancelInvoice } from '@/lib/billing/service';
import { invoiceCancelSchema, isUuid } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That invoice could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('invoices.cancel');
    const { invoiceId } = await params;
    if (!isUuid(invoiceId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`invoice-cancel:${viewer.user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many cancellations. Try again shortly.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(invoiceCancelSchema, body);
    const result = await cancelInvoice({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      invoiceId,
      cancellationReason: data.cancellationReason,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
