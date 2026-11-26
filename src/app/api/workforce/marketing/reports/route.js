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
import { createReport, listReports } from '@/lib/marketing/reporting';
import { reportCreateSchema, reportQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('marketing.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(reportQuerySchema, search);
    const result = await listReports(viewer.membership.workspaceId, query);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.report');

    const limit = rateLimit(`marketing-report-create:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many reports generated in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(reportCreateSchema, body);
    const report = await createReport({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });
    return jsonOk({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
