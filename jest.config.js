/**
 * Jest configuration.
 *
 * For v1 we use ts-jest with the `node` environment for all tests.
 * Pure-logic tests (engine, db, model, chat) need no RN context — they
 * run fast in Node. Component tests can be added later with a separate
 * project entry that uses jest-expo if needed.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.ts'
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }]
  },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/']
};
