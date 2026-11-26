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
  convertLead,
  getLeadConversionPreview,
} from '@/lib/leads/conversion';
import { leadAccessFor } from '@/lib/leads/service';
import { isUuid, leadConversionSchema } from '@/lib/leads/validation';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const viewer = await requirePermission('leads.convert');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const preview = await getLeadConversionPreview({
      workspaceId: viewer.membership.workspaceId,
      leadId,
      access: leadAccessFor(viewer),
    });
    if (!preview) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk(preview);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.convert');
    const { leadId } = await params;
    if (!isUuid(leadId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }

    const limit = rateLimit(`lead-convert:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many conversions in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const data = await validateBody(leadConversionSchema, body);

    const result = await convertLead({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      leadId,
      data,
      access: leadAccessFor(viewer),
    });
    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'That lead could not be found.');
    }
    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
