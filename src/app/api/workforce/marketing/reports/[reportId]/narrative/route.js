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
import {
  importReportNarrative,
  requestReportNarrative,
} from '@/lib/marketing/reporting';
import { isUuid, reportNarrativeSchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Requesting an AI narrative queues work; importing replaces the report summary
// with the completed run's text. Both are reporting actions, never automatic.
export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.report');
    const { reportId } = await params;
    if (!isUuid(reportId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That marketing report could not be found.');
    }

    const limit = rateLimit(`marketing-report-narrative:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many narrative requests in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(reportNarrativeSchema, body);
    const workspaceId = viewer.membership.workspaceId;

    if (data.action === 'import') {
      const report = await importReportNarrative({
        workspaceId,
        userId: viewer.user.id,
        reportId,
        runId: data.runId,
      });
      return jsonOk({ report });
    }

    const result = await requestReportNarrative({
      workspaceId,
      userId: viewer.user.id,
      reportId,
    });
    return jsonOk(result, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
