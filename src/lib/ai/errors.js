export class ProviderError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export const RETRYABLE_CODES = new Set([
  'rate_limited',
  'timeout',
  'network',
  'provider_error',
]);
