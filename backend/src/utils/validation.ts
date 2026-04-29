/**
 * Validation helpers for the Colleague Voice Bot.
 * Each function returns a result object indicating whether the input is valid,
 * along with an optional human-readable message, field name, and constraint description.
 */

export interface ValidationResult {
  valid: boolean;
  message?: string;
  field?: string;
  constraint?: string;
}

const ALLOWED_AUDIO_FORMATS = new Set(['mp3', 'wav', 'm4a']);
const ALLOWED_LANGUAGE_CODES = new Set(['en', 'fr', 'hi']);

const DURATION_MIN = 10;
const DURATION_MAX = 300;
const TEXT_MIN = 1;
const TEXT_MAX = 500;
const SINGING_TEXT_MIN = 1;
const SINGING_TEXT_MAX = 200;

/**
 * Validates that the audio format is one of the supported types: mp3, wav, m4a.
 */
export function validateAudioFormat(format: string): ValidationResult {
  if (ALLOWED_AUDIO_FORMATS.has(format)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Unsupported audio format "${format}". Supported formats are: mp3, wav, m4a.`,
    field: 'format',
    constraint: 'enum=mp3,wav,m4a',
  };
}

/**
 * Validates that the audio duration is within the allowed range [10, 300] seconds (inclusive).
 */
export function validateDuration(seconds: number): ValidationResult {
  if (seconds < DURATION_MIN) {
    return {
      valid: false,
      message: `Audio duration ${seconds}s is too short. Minimum duration is ${DURATION_MIN} seconds.`,
      field: 'duration',
      constraint: `min=${DURATION_MIN}`,
    };
  }
  if (seconds > DURATION_MAX) {
    return {
      valid: false,
      message: `Audio duration ${seconds}s is too long. Maximum duration is ${DURATION_MAX} seconds.`,
      field: 'duration',
      constraint: `max=${DURATION_MAX}`,
    };
  }
  return { valid: true };
}

/**
 * Validates that the synthesis text length is within [1, 500] characters (inclusive).
 */
export function validateTextLength(text: string): ValidationResult {
  const len = text.length;
  if (len < TEXT_MIN) {
    return {
      valid: false,
      message: `Text must not be empty.`,
      field: 'text',
      constraint: `minLength=${TEXT_MIN}`,
    };
  }
  if (len > TEXT_MAX) {
    return {
      valid: false,
      message: `Text length ${len} exceeds the maximum of ${TEXT_MAX} characters.`,
      field: 'text',
      constraint: `maxLength=${TEXT_MAX}`,
    };
  }
  return { valid: true };
}

/**
 * Validates that the singing mode text length is within [1, 200] characters (inclusive).
 */
export function validateSingingTextLength(text: string): ValidationResult {
  const len = text.length;
  if (len < SINGING_TEXT_MIN) {
    return {
      valid: false,
      message: `Singing text must not be empty.`,
      field: 'text',
      constraint: `minLength=${SINGING_TEXT_MIN}`,
    };
  }
  if (len > SINGING_TEXT_MAX) {
    return {
      valid: false,
      message: `Singing text length ${len} exceeds the maximum of ${SINGING_TEXT_MAX} characters for singing mode.`,
      field: 'text',
      constraint: `maxLength=${SINGING_TEXT_MAX}`,
    };
  }
  return { valid: true };
}

/**
 * Validates that the language code is one of the supported codes: en, fr, hi.
 */
export function validateLanguageCode(lang: string): ValidationResult {
  if (ALLOWED_LANGUAGE_CODES.has(lang)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Unsupported language code "${lang}". Supported languages are: en, fr, hi.`,
    field: 'language',
    constraint: 'enum=en,fr,hi',
  };
}
