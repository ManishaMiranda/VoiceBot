import * as fc from 'fast-check';
import {
  validateAudioFormat,
  validateDuration,
  validateTextLength,
  validateSingingTextLength,
  validateLanguageCode,
} from '@colleague-voice-bot/backend/utils/validation';

const VALID_FORMATS = ['mp3', 'wav', 'm4a'];
const VALID_LANGUAGES = ['en', 'fr', 'hi'];

// Feature: colleague-voice-bot, Property 1: Audio format validation
describe('Property 1: Audio format validation', () => {
  it('accepts a format if and only if it is mp3, wav, or m4a', () => {
    fc.assert(
      fc.property(fc.string(), (format) => {
        const result = validateAudioFormat(format);
        const isValid = VALID_FORMATS.includes(format);
        expect(result.valid).toBe(isValid);
        if (!isValid) {
          expect(result.message).toBeTruthy();
          expect(result.field).toBe('format');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('always accepts the three valid formats', () => {
    for (const fmt of VALID_FORMATS) {
      expect(validateAudioFormat(fmt).valid).toBe(true);
    }
  });
});

// Feature: colleague-voice-bot, Property 3: Duration bounds validation
describe('Property 3: Duration bounds validation', () => {
  it('accepts duration if and only if it is in [10, 300]', () => {
    fc.assert(
      fc.property(fc.float({ min: -1000, max: 4000, noNaN: true }), (duration) => {
        const result = validateDuration(duration);
        const isValid = duration >= 10 && duration <= 300;
        expect(result.valid).toBe(isValid);
        if (!isValid) {
          expect(result.message).toBeTruthy();
          expect(result.field).toBe('duration');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects durations below 10 seconds', () => {
    fc.assert(
      fc.property(fc.float({ min: -1000, max: 9.999, noNaN: true }), (duration) => {
        const result = validateDuration(duration);
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/too short|minimum/i);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects durations above 300 seconds', () => {
    fc.assert(
      fc.property(fc.float({ min: 300.001, max: 10000, noNaN: true }), (duration) => {
        const result = validateDuration(duration);
        expect(result.valid).toBe(false);
        expect(result.message).toMatch(/too long|maximum/i);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: colleague-voice-bot, Property 8: Synthesis text length validation
describe('Property 8: Synthesis text length validation', () => {
  it('accepts text if and only if its length is in [1, 500]', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 600 }), (text) => {
        const result = validateTextLength(text);
        const isValid = text.length >= 1 && text.length <= 500;
        expect(result.valid).toBe(isValid);
        if (!isValid) {
          expect(result.message).toBeTruthy();
          expect(result.field).toBe('text');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects empty string', () => {
    expect(validateTextLength('').valid).toBe(false);
  });

  it('rejects text longer than 500 characters', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 501, maxLength: 1000 }), (text) => {
        expect(validateTextLength(text).valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: colleague-voice-bot, Property 14: Language code validation
describe('Property 14: Language code validation', () => {
  it('accepts a language code if and only if it is en, fr, or hi', () => {
    fc.assert(
      fc.property(fc.string(), (lang) => {
        const result = validateLanguageCode(lang);
        const isValid = VALID_LANGUAGES.includes(lang);
        expect(result.valid).toBe(isValid);
        if (!isValid) {
          expect(result.message).toBeTruthy();
          expect(result.field).toBe('language');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('always accepts the three valid language codes', () => {
    for (const lang of VALID_LANGUAGES) {
      expect(validateLanguageCode(lang).valid).toBe(true);
    }
  });
});

// Feature: colleague-voice-bot, Property 16: Singing mode text length validation
describe('Property 16: Singing mode text length validation', () => {
  it('accepts singing text if and only if its length is in [1, 200]', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        const result = validateSingingTextLength(text);
        const isValid = text.length >= 1 && text.length <= 200;
        expect(result.valid).toBe(isValid);
        if (!isValid) {
          expect(result.message).toBeTruthy();
          expect(result.field).toBe('text');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects empty string for singing mode', () => {
    expect(validateSingingTextLength('').valid).toBe(false);
  });

  it('rejects singing text longer than 200 characters', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 201, maxLength: 500 }), (text) => {
        expect(validateSingingTextLength(text).valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
