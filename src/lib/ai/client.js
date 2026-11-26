export async function apiRequest(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || 'The request could not be completed.',
    );
    error.status = response.status;
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    error.details = payload?.error?.details || null;
    throw error;
  }

  return payload?.data;
}
