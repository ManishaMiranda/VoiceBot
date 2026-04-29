/**
 * Custom error classes for the Colleague Voice Bot.
 *
 * Each class extends Error and implements toResponse() which returns the
 * structured JSON error body used by Lambda handlers.
 */

export interface ErrorResponse {
  error: string;
  message: string;
  field?: string;
  constraint?: string;
}

/**
 * Raised when request input fails validation (HTTP 400).
 */
export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly field?: string;
  readonly constraint?: string;

  constructor(message: string, field?: string, constraint?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.constraint = constraint;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  toResponse(): ErrorResponse {
    return {
      error: 'VALIDATION_ERROR',
      message: this.message,
      ...(this.field !== undefined && { field: this.field }),
      ...(this.constraint !== undefined && { constraint: this.constraint }),
    };
  }
}

/**
 * Raised when synthesis is requested for a colleague whose profile is not ready (HTTP 422).
 */
export class NotReadyError extends Error {
  readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'NotReadyError';
    Object.setPrototypeOf(this, NotReadyError.prototype);
  }

  toResponse(): ErrorResponse {
    return {
      error: 'PROFILE_NOT_READY',
      message: this.message,
    };
  }
}

/**
 * Raised when a checksum mismatch is detected during profile build (HTTP 409).
 */
export class ChecksumMismatchError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ChecksumMismatchError';
    Object.setPrototypeOf(this, ChecksumMismatchError.prototype);
  }

  toResponse(): ErrorResponse {
    return {
      error: 'CHECKSUM_MISMATCH',
      message: this.message,
    };
  }
}

/**
 * Raised when a colleague already has the maximum number of samples (HTTP 400).
 */
export class SampleLimitError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'SampleLimitError';
    Object.setPrototypeOf(this, SampleLimitError.prototype);
  }

  toResponse(): ErrorResponse {
    return {
      error: 'SAMPLE_LIMIT_EXCEEDED',
      message: this.message,
    };
  }
}

/**
 * Raised when a profile build is already in progress (HTTP 409).
 */
export class BuildInProgressError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'BuildInProgressError';
    Object.setPrototypeOf(this, BuildInProgressError.prototype);
  }

  toResponse(): ErrorResponse {
    return {
      error: 'BUILD_IN_PROGRESS',
      message: this.message,
    };
  }
}
