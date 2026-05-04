// ESLint v9 flat config. Mirrors the rules previously in .eslintrc.cjs.
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactPlugin = require('eslint-plugin-react');
const reactNativePlugin = require('eslint-plugin-react-native');
const js = require('@eslint/js');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'docs/**',
      '.superpowers/**',
      '.claude/**',
      '__mocks__/**',
      'scripts/**',
      'plugins/**',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'jest-setup.ts',
      'eslint.config.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        // Node + jest
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        // Web/RN
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-native': reactNativePlugin
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-undef': 'off', // TS handles this
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
