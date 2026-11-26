import { errorResponse, jsonOk, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { leadAccessFor } from '@/lib/leads/service';
import { leadQuerySchema } from '@/lib/leads/validation';
import { getSalesCallerWorkspace } from '@/lib/sales/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('leads.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(leadQuerySchema, search);

    const result = await getSalesCallerWorkspace({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      access: leadAccessFor(viewer),
      leadQuery: query,
    });
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
