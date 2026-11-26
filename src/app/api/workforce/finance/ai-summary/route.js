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
import { requestFinanceAiSummary } from '@/lib/billing/service';
import { financeAiSummarySchema } from '@/lib/billing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('finance.view');
    await requirePermission('agents.run');

    const limit = rateLimit(`finance-ai:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many finance summaries requested. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(financeAiSummarySchema, body);
    const result = await requestFinanceAiSummary({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      instruction: data.instruction || null,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
