import {
  errorResponse,
  jsonOk,
  validateBody,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listMarketingClients } from '@/lib/marketing/service';
import { marketingClientQuerySchema } from '@/lib/marketing/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const viewer = await requirePermission('marketing.view');
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const query = await validateBody(marketingClientQuerySchema, search);
    const result = await listMarketingClients(
      viewer.membership.workspaceId,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return errorResponse(error);
  }
}
