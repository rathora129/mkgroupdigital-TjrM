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
  createWebsiteAudit,
  listWebsiteAudits,
} from '@/lib/audits/service';
import {
  websiteAuditCreateSchema,
  websiteAuditQuerySchema,
} from '@/lib/audits/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('audits.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(websiteAuditQuerySchema, search);

    const audits = await listWebsiteAudits(viewer.membership.workspaceId, query);
    return jsonOk(audits);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('audits.create');

    const limit = rateLimit(`website-audit-create:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many audits started in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(websiteAuditCreateSchema, body);

    const audit = await createWebsiteAudit({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ audit }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
