/* -------------------------------------------------------------------------- */
/*  TrendsMart — Jest Configuration (Prompt 3)                                   */
/*  TypeScript-first test runner with JSDOM environment for React components   */
/* -------------------------------------------------------------------------- */

import type { Config } from "jest";

const config: Config = {
  // Use ts-jest for TypeScript transformation
  preset: "ts-jest",

  // JSDOM environment for React component testing
  testEnvironment: "jsdom",

  // Root directory
  rootDir: ".",

  // Setup files run before each test suite
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Module name mapping for @/ alias and asset mocking
  moduleNameMapper: {
    // Match Next.js path alias
    "^@/(.*)$": "<rootDir>/$1",

    // Mock CSS/SCSS modules
    "\\.(css|scss|sass)$": "identity-obj-proxy",

    // Mock image imports
    "\\.(jpg|jpeg|png|gif|webp|avif|svg)$": "<rootDir>/__mocks__/fileMock.ts",
  },

  // Transform configuration
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: "tsconfig.json",
      // Use ESM for Next.js compatibility
      useESM: true,
    }],
  },

  // File extensions to consider
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

  // Test file matching patterns
  testMatch: [
    "<rootDir>/__tests__/**/*.{test,spec}.{ts,tsx}",
    "<rootDir>/__tests__/**/**/*.{test,spec}.{ts,tsx}",
  ],

  // Ignore these directories
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/out/",
  ],

  // Collect coverage from these files
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "services/**/*.{ts,tsx}",
    "context/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],

  // Coverage thresholds (Prompt 3: zero regression)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Coverage output directory
  coverageDirectory: "<rootDir>/coverage",

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Verbose output for CI
  verbose: true,

  // Test timeout (10 seconds for integration tests)
  testTimeout: 10_000,
};

export default config;