import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import {
  createImportBatch,
  getImportOverview,
  listImportBatches,
} from '@/lib/leads/import';
import { leadImportCreateSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A 400k-character paste is well under this once JSON-encoded.
const IMPORT_BODY_LIMIT = 1_000_000;

export async function GET() {
  try {
    const viewer = await requirePermission('leads.import');
    const workspaceId = viewer.membership.workspaceId;

    const [batches, overview] = await Promise.all([
      listImportBatches(workspaceId),
      getImportOverview(workspaceId),
    ]);

    return jsonOk({ batches, overview });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.import');

    const limit = rateLimit(`lead-import:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many import previews in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: IMPORT_BODY_LIMIT });
    const data = await validateBody(leadImportCreateSchema, body);

    const result = await createImportBatch({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      text: data.text,
      source: data.source,
      fileName: data.fileName ?? null,
      mapping: data.mapping ?? null,
    });

    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
