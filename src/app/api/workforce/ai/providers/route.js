import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { listProviderMetadata } from '@/lib/ai/registry';
import { listProviderSettings } from '@/lib/ai/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requirePermission('agents.view');
    const settings = await listProviderSettings(viewer.membership.workspaceId);

    const providers = listProviderMetadata().map((provider) => ({
      ...provider,
      workspaceEnabled: settings[provider.key]?.enabled !== false,
      workspaceDefaultModel: settings[provider.key]?.defaultModel || null,
    }));

    return jsonOk({ providers });
  } catch (error) {
    return errorResponse(error);
  }
}
