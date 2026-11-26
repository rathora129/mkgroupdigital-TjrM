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
import { createResearchJob, listResearchJobs } from '@/lib/research/service';
import {
  researchCreateSchema,
  researchQuerySchema,
} from '@/lib/research/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('research.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(researchQuerySchema, search);

    const jobs = await listResearchJobs(viewer.membership.workspaceId, query);
    return jsonOk(jobs);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('research.create');

    const limit = rateLimit(`research-create:${viewer.user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many research jobs started in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(researchCreateSchema, body);

    const job = await createResearchJob({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ job }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
