import {
  ApiError,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { rateLimit } from '@/lib/rate-limit';
import {
  buildProposalDocument,
  recordProposalExport,
} from '@/lib/proposals/service';
import { isUuid } from '@/lib/proposals/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const viewer = await requirePermission('proposals.export');
    const { proposalId } = await params;
    if (!isUuid(proposalId)) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    const limit = rateLimit(`proposal-export:${viewer.user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Too many document requests in a short period. Try again shortly.',
      );
    }

    const document = await buildProposalDocument(
      viewer.membership.workspaceId,
      proposalId,
    );
    if (!document) {
      throw new ApiError(404, 'NOT_FOUND', 'That proposal could not be found.');
    }

    await recordProposalExport({
      workspaceId: viewer.membership.workspaceId,
      userId: viewer.user.id,
      proposalId,
    });

    return jsonOk(document);
  } catch (error) {
    return errorResponse(error);
  }
}
