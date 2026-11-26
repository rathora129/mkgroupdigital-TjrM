import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { findPossibleDuplicates } from '@/lib/leads/service';
import { isUuid } from '@/lib/leads/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clean(value, max = 200) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function GET(request) {
  try {
    const viewer = await requirePermission('leads.view');
    const search = new URL(request.url).searchParams;
    const excludeLeadId = search.get('excludeLeadId')?.trim() || null;

    const duplicates = await findPossibleDuplicates(
      viewer.membership.workspaceId,
      {
        companyName: clean(search.get('companyName'), 160),
        email: clean(search.get('email'), 200),
        website: clean(search.get('website'), 300),
      },
      {
        excludeLeadId: isUuid(excludeLeadId) ? excludeLeadId : null,
      },
    );

    return jsonOk({ duplicates });
  } catch (error) {
    return errorResponse(error);
  }
}
