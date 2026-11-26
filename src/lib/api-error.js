// Kept free of next/server so services and the worker can import the error
// types without pulling in the request runtime.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AccessError extends ApiError {
  constructor(status, code, message) {
    super(status, code, message);
    this.name = 'AccessError';
  }
}
