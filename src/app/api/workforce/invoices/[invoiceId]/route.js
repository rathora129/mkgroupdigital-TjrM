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
import { getInvoice, updateDraftInvoice } from '@/lib/billing/service';
import { invoiceUpdateSchema, isUuid } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That invoice could not be found.';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('invoices.view');
    const { invoiceId } = await params;
    if (!isUuid(invoiceId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const detail = await getInvoice(viewer.membership.workspaceId, invoiceId);
    if (!detail) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('invoices.update');
    const { invoiceId } = await params;
    if (!isUuid(invoiceId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`invoice-update:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many invoice edits in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(invoiceUpdateSchema, body);
    const result = await updateDraftInvoice({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      invoiceId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
