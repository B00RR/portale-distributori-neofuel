// ESLint flat config (ESLint v9+)
// Migrazione da .eslintrc.json al nuovo formato piatto.
// Questo formato funziona in modo coerente con ESLint 9 e 10, eliminando
// il conflitto di risoluzione che faceva fallire la vecchia .eslintrc.json.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import importPlugin from 'eslint-plugin-import';
import promise from 'eslint-plugin-promise';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dev-dist/**',
      '**/*.min.js',
      'js/utils/template_chiusura_base64.js',
      'production_bundle.js'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // File di configurazione alla radice (vite.config.js, ecc.): girano in Node,
  // servono i globals node per non incappare in no-undef su process/console.
  {
    files: ['*.config.js', '*.config.ts', 'config/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  {
    files: ['js/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        jspdf: 'readonly',
        jsPDF: 'readonly',
        XlsxPopulate: 'readonly',
        Chart: 'readonly',
        Split: 'readonly',
        Sortable: 'readonly',
        Html5Qrcode: 'readonly',
        TEMPLATE_BASE64: 'readonly',
        QRCode: 'readonly',
        supabase: 'readonly'
      }
    },
    plugins: {
      security,
      'no-unsanitized': noUnsanitized,
      import: importPlugin,
      promise
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error']
        }
      ],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      curly: ['error', 'all'],
      'import/no-unresolved': 'off',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc'
          }
        }
      ],
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'error',
      semi: ['error', 'always'],
      quotes: [
        'warn',
        'single',
        {
          avoidEscape: true
        }
      ],
      indent: [
        'warn',
        2,
        {
          SwitchCase: 1
        }
      ],
      'comma-dangle': ['warn', 'never'],
      'object-curly-spacing': ['warn', 'always'],
      'array-bracket-spacing': ['warn', 'never']
    }
  },

  {
    files: ['js/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true
        }
      ]
    }
  },

  // Test files: align with the relaxed js/** severities (any/unused-vars as
  // warnings, not errors). Test mocks legitimately use `any`; without this
  // override tests inherited tseslint.recommended defaults (error-level),
  // which made them stricter than production and blocked the pre-commit hook.
  {
    files: ['tests/**/*.{js,ts}', 'e2e/**/*.{js,ts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },

  // Must be last: disables ESLint stylistic rules that conflict with Prettier
  // (indent, semi, quotes, comma-dangle, spacing). Prettier owns formatting.
  prettierConfig
);
