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
import { addAuditFinding, listAuditFindings } from '@/lib/marketing/seo';
import {
  auditFindingCreateSchema,
  auditFindingQuerySchema,
  isUuid,
} from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('audits.view');
    const { auditId } = await params;
    if (!isUuid(auditId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(auditFindingQuerySchema, search);
    const result = await listAuditFindings(
      viewer.membership.workspaceId,
      auditId,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { auditId } = await params;
    if (!isUuid(auditId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That audit could not be found.');
    }

    const limit = rateLimit(`marketing-finding-create:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many findings recorded in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(auditFindingCreateSchema, body);
    const finding = await addAuditFinding({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      auditId,
      data,
    });
    return jsonOk({ finding }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
