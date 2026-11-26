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
import { createProject, listProjects } from '@/lib/projects/service';
import { projectCreateSchema, projectQuerySchema } from '@/lib/projects/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('projects.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(projectQuerySchema, search);

    const result = await listProjects(
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
    const viewer = await requirePermission('projects.create');

    const limit = rateLimit(`project-create:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many projects created in a short period. Try again shortly.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(projectCreateSchema, body);

    const result = await createProject({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
