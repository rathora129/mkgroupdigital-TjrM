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
import { listPayments, recordPayment } from '@/lib/billing/service';
import { paymentCreateSchema, paymentQuerySchema } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('payments.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(paymentQuerySchema, search);
    const result = await listPayments(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('payments.record');

    const limit = rateLimit(`payment-record:${viewer.user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many payments recorded in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(paymentCreateSchema, body);
    const result = await recordPayment({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
