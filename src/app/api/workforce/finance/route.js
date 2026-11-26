import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getFinanceOverview } from '@/lib/billing/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('finance.view');
    const result = await getFinanceOverview(viewer.membership.workspaceId);
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
