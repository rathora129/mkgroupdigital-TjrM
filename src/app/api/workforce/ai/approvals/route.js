import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listApprovals } from '@/lib/ai/runtime';
import { approvalQuerySchema } from '@/lib/ai/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('approvals.review');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(approvalQuerySchema, search);

    const approvals = await listApprovals(viewer.membership.workspaceId, query);
    return jsonOk(approvals);
  } catch (error) {
    return errorResponse(error);
  }
}
