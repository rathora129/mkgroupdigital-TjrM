import { ApiError } from '@/lib/api-error';

// Request-level guards kept free of any Next.js import so they can be unit
// tested in plain Node. src/lib/api.js re-exports these for route handlers.
const MAX_BODY_BYTES = 32 * 1024;

export async function readJsonBody(request, { maxBytes = MAX_BODY_BYTES } = {}) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new ApiError(413, 'BODY_TOO_LARGE', 'That request is too large.');
  }

  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body could not be read.');
  }
}

// Browsers send Origin on state-changing requests. SameSite=Lax cookies also
// block cross-site POSTs; this is the second layer.
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'This request was rejected.');
  }

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'INVALID_ORIGIN', 'This request was rejected.');
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host');

  if (!host || originHost !== host) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'This request was rejected.');
  }
}

// Unexpected errors never echo their message to the client; only known
// ApiError values carry a safe, deliberate message.
export function errorPayload(error) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  console.error(`[workforce-api] ${error?.name || 'Error'}`);
  return {
    status: 500,
    code: 'INTERNAL',
    message: 'Something went wrong. Please try again.',
    details: undefined,
  };
}
