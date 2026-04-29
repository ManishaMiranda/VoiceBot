/**
 * Retries an async operation with exponential backoff and jitter.
 *
 * Delay formula: baseDelayMs * 2^attempt + random(0, baseDelayMs)
 *
 * @param fn          The async operation to retry.
 * @param retries     Maximum number of retry attempts (default: 3).
 * @param baseDelayMs Base delay in milliseconds (default: 100).
 * @returns           The resolved value of fn on success.
 * @throws            The last error thrown by fn after all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
