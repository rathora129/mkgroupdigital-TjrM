import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listMembershipHistory } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('members.view');
    const { id } = await params;

    const history = await listMembershipHistory(
      viewer.membership.workspaceId,
      id,
    );

    return jsonOk({ history });
  } catch (error) {
    return errorResponse(error);
  }
}
