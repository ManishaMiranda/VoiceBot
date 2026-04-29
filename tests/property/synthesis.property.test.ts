import * as fc from 'fast-check';
import { computeCacheKey } from '@colleague-voice-bot/backend/utils/cacheKey';

// Feature: colleague-voice-bot, Property 11: Synthesis caching idempotence
describe('Property 11: Synthesis caching idempotence', () => {
  it('produces the same cache key for identical inputs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('en', 'fr', 'hi'),
        fc.boolean(),
        (text, colleagueId, lang, singing) => {
          const key1 = computeCacheKey(text, colleagueId, lang, singing);
          const key2 = computeCacheKey(text, colleagueId, lang, singing);
          expect(key1).toBe(key2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('"Hello" and "hello" produce the same cache key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('en', 'fr', 'hi'),
        fc.boolean(),
        (colleagueId, lang, singing) => {
          const keyUpper = computeCacheKey('Hello', colleagueId, lang, singing);
          const keyLower = computeCacheKey('hello', colleagueId, lang, singing);
          expect(keyUpper).toBe(keyLower);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces different keys for different inputs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('en', 'fr', 'hi'),
        fc.boolean(),
        (text1, text2, colleagueId, lang, singing) => {
          // Only check when texts differ after lowercasing
          if (text1.toLowerCase() !== text2.toLowerCase()) {
            const key1 = computeCacheKey(text1, colleagueId, lang, singing);
            const key2 = computeCacheKey(text2, colleagueId, lang, singing);
            expect(key1).not.toBe(key2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('cache key is a 64-character hex string (SHA-256)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('en', 'fr', 'hi'),
        fc.boolean(),
        (text, colleagueId, lang, singing) => {
          const key = computeCacheKey(text, colleagueId, lang, singing);
          expect(key).toHaveLength(64);
          expect(key).toMatch(/^[0-9a-f]{64}$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});
