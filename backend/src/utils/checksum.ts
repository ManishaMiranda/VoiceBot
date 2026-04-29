import { createHash } from 'crypto';

/**
 * Computes the SHA-256 hex digest of the given buffer.
 * Returns a 64-character lowercase hexadecimal string.
 */
export function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
