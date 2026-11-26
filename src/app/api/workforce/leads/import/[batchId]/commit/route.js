import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { commitImportBatch } from '@/lib/leads/import';
import { isUuid, leadImportCommitSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.import');
    const { batchId } = await params;
    if (!isUuid(batchId)) {
      throw new ApiError(404, 'IMPORT_NOT_FOUND', 'That import batch could not be found.');
    }

    const limit = rateLimit(`lead-import-commit:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many commits in a short period. Try again shortly.',
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    const body = contentLength > 0
      ? await readJsonBody(request, { maxBytes: 8 * 1024 })
      : {};
    const data = await validateBody(leadImportCommitSchema, body);

    const result = await commitImportBatch({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      batchId,
      confirmRepeat: data.confirmRepeat,
    });

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
