// ESLint flat config for the whole monorepo.
// Architecture boundaries from CLAUDE.md §2.2 are enforced here with `no-restricted-imports`.
// NOTE: in flat config a later block REPLACES (not merges) an earlier rule's options, so every
// file-specific block re-composes the full pattern list via `restrict(...)`.
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/** Vendor SDKs may only be imported inside `apps/api/src/adapters/**` (CLAUDE.md §2.2, §3.3). */
const VENDOR_SDKS = {
  group: [
    'stripe',
    'moyasar*',
    '@moyasar/*',
    'twilio',
    'nodemailer',
    '@sendgrid/*',
    '@aws-sdk/*',
    '@google-cloud/*',
    'deepl-node',
    'openai',
    '@anthropic-ai/*',
    'unifonic*',
    'taqnyat*',
  ],
  message:
    'Third-party SDKs are allowed only in apps/api/src/adapters/** (use the adapter interface).',
};

/** A module may import another module only through its public `index.js`. */
const CROSS_MODULE_INTERNALS = {
  group: [
    '../*/*.model*',
    '../*/*.repo*',
    '../*/*.service*',
    '../*/*.controller*',
    '../*/*.routes*',
    '../*/*.events*',
    '**/modules/*/*.model*',
    '**/modules/*/*.repo*',
    '**/modules/*/*.service*',
    '**/modules/*/*.controller*',
    '**/modules/*/*.routes*',
    '**/modules/*/*.events*',
  ],
  message: "Import another module only via its public index.js (e.g. '../catalog/index.js').",
};

/** Controllers/routes must go through the service layer. */
const NO_REPO_OR_MODEL = {
  group: ['./*.repo*', './*.model*'],
  message: 'Layering: Controller/Routes -> Service -> Repo -> Model. Never skip a layer.',
};

/** Services must go through the repo layer. */
const NO_MODEL = {
  group: ['./*.model*'],
  message: 'Layering: only the repo touches the model. Use <feature>.repo.js.',
};

/** Frontends and shared packages must never reach into the API or server-only libraries. */
const NO_SERVER_CODE = {
  group: ['**/apps/api/**', 'mongoose', 'mongodb', 'bullmq', 'ioredis', 'express'],
  message:
    'Client/shared code must not import server-only code. Share contracts via @supershop/shared.',
};

/** Shared packages must not depend on apps. */
const NO_APPS = {
  group: ['**/apps/**', '@supershop/api'],
  message: 'packages/* must not import from apps/*.',
};

const restrict = (...patterns) => ['error', { patterns }];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/out/**',
    ],
  },

  js.configs.recommended,

  // Base for all JS
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn', // use the pino logger (P0.2)
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-throw-literal': 'error',
      'no-implicit-coercion': 'error',
      'no-return-await': 'off',
      'require-await': 'off',
    },
  },

  // ---------- API ----------
  {
    files: ['apps/api/src/**/*.js'],
    rules: { 'no-restricted-imports': restrict(VENDOR_SDKS) },
  },
  {
    files: ['apps/api/src/modules/**/*.js'],
    rules: { 'no-restricted-imports': restrict(VENDOR_SDKS, CROSS_MODULE_INTERNALS) },
  },
  {
    files: ['apps/api/src/modules/**/*.controller.js', 'apps/api/src/modules/**/*.routes.js'],
    rules: {
      'no-restricted-imports': restrict(VENDOR_SDKS, CROSS_MODULE_INTERNALS, NO_REPO_OR_MODEL),
    },
  },
  {
    files: ['apps/api/src/modules/**/*.service.js', 'apps/api/src/modules/**/*.events.js'],
    rules: { 'no-restricted-imports': restrict(VENDOR_SDKS, CROSS_MODULE_INTERNALS, NO_MODEL) },
  },
  {
    // Adapters are the only place vendor SDKs may live.
    files: ['apps/api/src/adapters/**/*.js'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // ---------- Frontends ----------
  {
    files: ['apps/admin/**/*.{js,jsx}', 'apps/storefront/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-restricted-imports': restrict(NO_SERVER_CODE) },
  },
  {
    files: [
      'apps/admin/src/**/*.{js,jsx}',
      'apps/storefront/src/**/*.{js,jsx}',
      'packages/ui/src/**/*.{js,jsx}',
    ],
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // React 17+ automatic runtime
      'react/prop-types': 'off', // JS project: JSDoc where helpful, zod at boundaries
      'react/jsx-no-target-blank': 'error',
      'react/no-danger': 'error', // user content must go through the sanitized renderer
    },
  },
  {
    files: [
      'apps/admin/src/**/*.{js,jsx}',
      'apps/storefront/src/**/*.{js,jsx}',
      'packages/ui/src/**/*.{js,jsx}',
    ],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['apps/admin/src/**/*.jsx'],
    ...reactRefresh.configs.vite,
  },
  {
    // Build/test tooling for frontends runs in Node.
    files: ['apps/admin/vite.config.js', 'apps/storefront/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },

  // ---------- Shared packages ----------
  {
    files: ['packages/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-restricted-imports': restrict(NO_APPS, NO_SERVER_CODE, VENDOR_SDKS) },
  },

  // ---------- Tests & tooling ----------
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: { globals: { ...globals.vitest } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['*.config.js', 'scripts/**/*.js', 'docker/**/*.js'],
    rules: { 'no-console': 'off' },
  },

  // Must be last: turns off stylistic rules that conflict with Prettier.
  prettier,
];
