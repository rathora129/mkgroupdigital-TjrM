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
import { decideExpense } from '@/lib/billing/service';
import { expenseDecisionSchema, isUuid } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That expense could not be found.';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('expenses.approve');
    const { expenseId } = await params;
    if (!isUuid(expenseId)) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);

    const limit = rateLimit(`expense-decide:${viewer.user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many decisions. Try again shortly.');
    }

    const body = await readJsonBody(request);
    const data = await validateBody(expenseDecisionSchema, body);
    const result = await decideExpense({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      expenseId,
      data,
    });
    if (!result) throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
