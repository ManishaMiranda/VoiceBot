import { createHash } from 'crypto';

/**
 * Computes a deterministic cache key for a synthesis request.
 *
 * The input string is: lower(text) + ":" + colleagueId + ":" + lang + ":" + str(singing)
 * The key is the SHA-256 hex digest of that string.
 *
 * Normalising text to lowercase ensures that "Hello" and "hello" share the same cache entry.
 */
export function computeCacheKey(
  text: string,
  colleagueId: string,
  lang: string,
  singing: boolean,
): string {
  const input = `${text.toLowerCase()}:${colleagueId}:${lang}:${String(singing)}`;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
