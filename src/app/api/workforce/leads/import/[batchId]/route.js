import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getImportBatch, updateImportRows } from '@/lib/leads/import';
import { isUuid, leadImportCorrectSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('leads.import');
    const { batchId } = await params;
    if (!isUuid(batchId)) {
      throw new ApiError(404, 'IMPORT_NOT_FOUND', 'That import batch could not be found.');
    }

    const detail = await getImportBatch(viewer.membership.workspaceId, batchId);
    if (!detail) {
      throw new ApiError(404, 'IMPORT_NOT_FOUND', 'That import batch could not be found.');
    }
    return jsonOk(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.import');
    const { batchId } = await params;
    if (!isUuid(batchId)) {
      throw new ApiError(404, 'IMPORT_NOT_FOUND', 'That import batch could not be found.');
    }

    const limit = rateLimit(`lead-import-correct:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many corrections in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
    const data = await validateBody(leadImportCorrectSchema, body);

    const result = await updateImportRows({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      batchId,
      corrections: data.corrections,
    });

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
