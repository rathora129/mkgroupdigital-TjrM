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
import { createProposal, listProposals } from '@/lib/proposals/service';
import {
  proposalCreateSchema,
  proposalQuerySchema,
} from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('proposals.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(proposalQuerySchema, search);

    const result = await listProposals(
      viewer.membership.workspaceId,
      viewer.user.id,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('proposals.create');

    const limit = rateLimit(`proposal-create:${viewer.user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many proposals created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(proposalCreateSchema, body);

    const result = await createProposal({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
