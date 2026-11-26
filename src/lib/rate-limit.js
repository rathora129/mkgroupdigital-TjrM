const buckets = new Map();
const MAX_BUCKETS = 2000;

// Best-effort per-instance limiter. On serverless this protects a single
// instance only; a shared store is required for global guarantees.
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
}
