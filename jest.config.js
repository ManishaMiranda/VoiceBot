/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/backend/src', '<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.property.test.ts',
    '**/*.smoke.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Use a relaxed tsconfig for tests
          strict: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: 'commonjs',
          target: 'ES2022',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@colleague-voice-bot/backend/(.*)$': '<rootDir>/backend/src/$1',
  },
  collectCoverageFrom: [
    'backend/src/**/*.ts',
    '!backend/src/**/*.d.ts',
    '!backend/src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // fast-check property tests can be slow — allow up to 30 s per test
  testTimeout: 30000,
  // Verbose output so property test failures show the counterexample
  verbose: true,
};
