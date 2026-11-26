import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listAuditLogs } from '@/lib/workspace/service';
import { auditQuerySchema } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('audit.view');
    const search = request.nextUrl.searchParams;

    const query = await validateBody(auditQuerySchema, {
      page: search.get('page') || undefined,
      pageSize: search.get('pageSize') || undefined,
      action: search.get('action') || undefined,
      resourceType: search.get('resourceType') || undefined,
      resourceId: search.get('resourceId') || undefined,
      actor: search.get('actor') || undefined,
      success: search.get('success') || undefined,
    });

    const result = await listAuditLogs({
      workspaceId: viewer.membership.workspaceId,
      ...query,
    });

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
