import {
  ApiError,
  errorResponse,
  jsonOk,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listKnowledgeVersions } from '@/lib/knowledge/service';
import { isUuid, versionQuerySchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('knowledge.view');
    const { entryId } = await params;
    if (!isUuid(entryId)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'That knowledge entry could not be found.',
      );
    }
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(memoryVersionsQuerySchema, search);
    const result = await listKnowledgeVersions(
      viewer.membership.workspaceId,
      entryId,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
