import {
  ApiError,
  errorResponse,
  jsonOk,
} from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { getProviderDefinition } from '@/lib/integrations/registry';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  ingestWebhook,
  readRawWebhookBody,
} from '@/lib/integrations/webhooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_KINDS = ['lead_source', 'webhook'];

function clientAddress(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request, { params }) {
  try {
    const { provider } = await params;
    const known = WEBHOOK_KINDS.some((kind) =>
      Boolean(getProviderDefinition(kind, provider)),
    );
    if (!known) {
      throw new ApiError(404, 'NOT_FOUND', 'Unknown webhook provider.');
    }

    const limit = rateLimit(`integration-webhook:${provider}:${clientAddress(request)}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many webhook requests. Try again shortly.');
    }

    const rawBody = await readRawWebhookBody(request);
    const result = await ingestWebhook({
      provider,
      rawBody,
      signature: request.headers.get(WEBHOOK_SIGNATURE_HEADER),
      timestamp: request.headers.get(WEBHOOK_TIMESTAMP_HEADER),
    });

    return jsonOk({ received: true, ...result }, result.duplicate ? 200 : 202);
  } catch (error) {
    return errorResponse(error);
  }
}
