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
import { decideApproval } from '@/lib/ai/runtime';
import { approvalDecisionSchema } from '@/lib/ai/validation';
import { finalizeResearchForRun } from '@/lib/research/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('approvals.review');

    const limit = rateLimit(`ai-approval:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many approval decisions in a short period. Try again later.',
      );
    }

    const { approvalId } = await params;
    const body = await readJsonBody(request);
    const data = await validateBody(approvalDecisionSchema, body);

    const result = await decideApproval({
      workspaceId: viewer.membership.workspaceId,
      approvalId,
      userId: viewer.user.id,
      decision: data.decision,
      note: data.note,
    });

    if (result.run?.id) {
      try {
        await finalizeResearchForRun(result.run.id);
      } catch {
        // Research bookkeeping must never block an approval decision.
      }
    }

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
