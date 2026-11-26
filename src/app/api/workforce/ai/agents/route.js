import {
  errorResponse,
  jsonOk,
  validateBody,
  assertSameOrigin,
  readJsonBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { AGENT_TYPE_KEYS } from '@/lib/ai/agent-types';
import { createAgent, listAgents } from '@/lib/ai/runtime';
import { agentCreateSchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('agents.view');
    const search = new URL(request.url).searchParams;

    const type = search.get('type');
    const enabledParam = search.get('enabled');

    const agents = await listAgents(viewer.membership.workspaceId, {
      includeArchived: search.get('includeArchived') === '1',
      type: AGENT_TYPE_KEYS.includes(type) ? type : undefined,
      enabled:
        enabledParam === 'true'
          ? true
          : enabledParam === 'false'
            ? false
            : undefined,
      search: search.get('search')?.trim() || undefined,
    });

    return jsonOk({ agents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.manage');
    const body = await readJsonBody(request);
    const data = await validateBody(agentCreateSchema, body);

    const agent = await createAgent({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      data,
    });

    return jsonOk({ agent }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
