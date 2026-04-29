import * as fc from 'fast-check';
import { createHash } from 'crypto';
import { computeChecksum } from '@colleague-voice-bot/backend/utils/checksum';

// Feature: colleague-voice-bot, Property 27: Checksum storage on upload
describe('Property 27: Checksum storage on upload', () => {
  it('returns a 64-character hex string equal to the SHA-256 digest for any buffer', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 1024 }),
        (bytes) => {
          const buffer = Buffer.from(bytes);
          const result = computeChecksum(buffer);

          // Must be a 64-character lowercase hex string
          expect(result).toHaveLength(64);
          expect(result).toMatch(/^[0-9a-f]{64}$/);

          // Must equal the SHA-256 digest computed independently
          const expected = createHash('sha256').update(buffer).digest('hex');
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles empty buffer', () => {
    const buffer = Buffer.alloc(0);
    const result = computeChecksum(buffer);
    const expected = createHash('sha256').update(buffer).digest('hex');
    expect(result).toBe(expected);
    expect(result).toHaveLength(64);
  });
});

// Feature: colleague-voice-bot, Property 28: Checksum integrity enforcement
describe('Property 28: Checksum integrity enforcement', () => {
  it('two different buffers produce different checksums', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        (bytes1, bytes2) => {
          // Only test when the byte arrays are actually different
          const buf1 = Buffer.from(bytes1);
          const buf2 = Buffer.from(bytes2);

          if (!buf1.equals(buf2)) {
            const checksum1 = computeChecksum(buf1);
            const checksum2 = computeChecksum(buf2);
            expect(checksum1).not.toBe(checksum2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same buffer always produces the same checksum (determinism)', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 512 }),
        (bytes) => {
          const buffer = Buffer.from(bytes);
          const checksum1 = computeChecksum(buffer);
          const checksum2 = computeChecksum(buffer);
          expect(checksum1).toBe(checksum2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('detects a mismatch when stored checksum differs from computed checksum', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        (bytes1, bytes2) => {
          const buf1 = Buffer.from(bytes1);
          const buf2 = Buffer.from(bytes2);

          const storedChecksum = computeChecksum(buf1);
          const retrievedChecksum = computeChecksum(buf2);

          // A mismatch is detected when the two checksums differ
          const mismatch = storedChecksum !== retrievedChecksum;
          expect(mismatch).toBe(!buf1.equals(buf2));
        },
      ),
      { numRuns: 100 },
    );
  });
});
