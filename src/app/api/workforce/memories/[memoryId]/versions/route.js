import { ApiError, errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listMemoryVersions } from '@/lib/knowledge/memory';
import { isUuid, versionQuerySchema } from '@/lib/knowledge/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('memories.view');
    const { memoryId } = await params;
    if (!isUuid(memoryId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That memory could not be found.');
    }
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(versionQuerySchema, search);
    const result = await listMemoryVersions(
      viewer.membership.workspaceId,
      memoryId,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
