import {
  assertSameOrigin,
  errorResponse,
  jsonOk,
  readJsonBody,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getWorkspaceById } from '@/lib/workspace/service';
import { updateWorkspaceAiLimits } from '@/lib/ai/runtime';
import { aiLimitsSchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('agents.view');
    const workspace = await getWorkspaceById(viewer.membership.workspaceId);
    return jsonOk({
      limits: {
        monthlyTokenLimit: workspace?.aiMonthlyTokenLimit ?? null,
        monthlyBudgetCents: workspace?.aiMonthlyBudgetCents ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertSameOrigin(request);
    const viewer = await requirePermission('agents.manage');
    const body = await readJsonBody(request);
    const changes = await validateBody(aiLimitsSchema, body);

    const workspace = await updateWorkspaceAiLimits({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      changes,
    });

    return jsonOk({
      limits: {
        monthlyTokenLimit: workspace.aiMonthlyTokenLimit,
        monthlyBudgetCents: workspace.aiMonthlyBudgetCents,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
