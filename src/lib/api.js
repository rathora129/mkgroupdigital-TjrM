import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api-error';
import { errorPayload } from '@/lib/http-guards';

export { ApiError, AccessError } from '@/lib/api-error';
export { assertSameOrigin, readJsonBody } from '@/lib/http-guards';

export function jsonOk(data, status = 200) {
  return NextResponse.json(
    { ok: true, data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonError(status, code, message, details) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, ...(details ? { details } : {}) },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function errorResponse(error) {
  const payload = errorPayload(error);
  return jsonError(payload.status, payload.code, payload.message, payload.details);
}

export async function validateBody(schema, payload) {
  try {
    return await schema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (error) {
    const details = {};
    for (const issue of error.inner || []) {
      if (issue.path && !details[issue.path]) details[issue.path] = issue.message;
    }
    throw new ApiError(
      422,
      'VALIDATION_FAILED',
      'Please check the highlighted fields and try again.',
      details,
    );
  }
}
