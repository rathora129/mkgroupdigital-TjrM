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
import { createLead, leadAccessFor, listLeads } from '@/lib/leads/service';
import { leadCreateSchema, leadQuerySchema } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('leads.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(leadQuerySchema, search);

    const leads = await listLeads(
      viewer.membership.workspaceId,
      viewer.user.id,
      query,
      leadAccessFor(viewer),
    );
    return jsonOk(leads);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('leads.create');

    const limit = rateLimit(`lead-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many leads created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(leadCreateSchema, body);

    const result = await createLead({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
