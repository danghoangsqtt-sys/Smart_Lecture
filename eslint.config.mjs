import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'data/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['server/src/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // SYSTEM-RULES.md #2: cam `any` ngam va tuong minh.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // SYSTEM-RULES.md #2: cam `any` ngam va tuong minh.
      '@typescript-eslint/no-explicit-any': 'error',
      // Classic hooks pair only — the newer React Compiler-readiness rules
      // bundled into this plugin's "recommended" config are a separate,
      // much larger initiative and out of scope for this lint pass.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['server/src/**/*.ts', 'web/src/**/*.{ts,tsx}'],
    rules: {
      // Leading underscore is the established convention here for
      // intentionally-unused params required by a fixed signature
      // (e.g. Express error-handler middleware's 4-arg shape).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
