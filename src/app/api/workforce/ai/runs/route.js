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
import { createAgentRun, listRuns } from '@/lib/ai/runtime';
import { runCreateSchema, runQuerySchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('agents.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(runQuerySchema, search);

    const runs = await listRuns(viewer.membership.workspaceId, query);
    return jsonOk(runs);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.run');

    const limit = rateLimit(`ai-run:${viewer.user.id}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many agent runs in a short period. Try again later.',
      );
    }

    const body = await readJsonBody(request);
    const data = await validateBody(runCreateSchema, body);

    const { run, reused } = await createAgentRun({
      workspaceId: viewer.membership.workspaceId,
      agentId: data.agentId,
      userId: viewer.user.id,
      input: data.input,
      idempotencyKey: data.idempotencyKey || null,
      contextRefs: data.contextRefs || null,
    });

    return jsonOk({ run, reused }, reused ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
