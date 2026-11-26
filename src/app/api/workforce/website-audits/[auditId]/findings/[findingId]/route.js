import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getAuditFinding, updateAuditFinding } from '@/lib/marketing/seo';
import { auditFindingUpdateSchema, isUuid } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NOT_FOUND = 'That audit finding could not be found.';

async function loadFindingInAudit(workspaceId, auditId, findingId) {
  const loaded = await getAuditFinding(workspaceId, findingId);
  if (loaded.finding.auditId !== auditId) {
    throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
  }
  return loaded;
}

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('audits.view');
    const { auditId, findingId } = await params;
    if (!isUuid(auditId) || !isUuid(findingId)) {
      throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    }
    const finding = await loadFindingInAudit(
      viewer.membership.workspaceId,
      auditId,
      findingId,
    );
    return jsonOk(finding);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('marketing.manage');
    const { auditId, findingId } = await params;
    if (!isUuid(auditId) || !isUuid(findingId)) {
      throw new ApiError(404, 'NOT_FOUND', NOT_FOUND);
    }

    const body = await readJsonBody(request);
    const data = await validateBody(auditFindingUpdateSchema, body);

    await loadFindingInAudit(viewer.membership.workspaceId, auditId, findingId);
    const finding = await updateAuditFinding({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      findingId,
      data,
    });
    return jsonOk(finding);
  } catch (error) {
    return errorResponse(error);
  }
}
