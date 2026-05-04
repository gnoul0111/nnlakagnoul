// Sử dụng .mjs thay vì .ts để tránh phụ thuộc ts-node runtime.
// next/jest.js xử lý TypeScript transformation thông qua SWC bên dưới —
// cấu hình này không cần TypeScript.

import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment:  'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
}

export default createJestConfig(config)
