import { ApiError, assertSameOrigin, errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { cancelImportBatch } from '@/lib/leads/import';
import { isUuid } from '@/lib/leads/validation';
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

    const limit = rateLimit(`lead-import-cancel:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many cancellations in a short period. Try again shortly.',
      );
    }

    const result = await cancelImportBatch({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      batchId,
    });

    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
