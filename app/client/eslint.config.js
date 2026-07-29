import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Браузерные глобалы для src/ (navigator, RTCPeerConnection, crypto, …)
        ...globals.browser,
        // Node-глобалы для конфигов сборки (vite.config.js: process и т.п.)
        ...globals.node,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      // SEC-04 (Design §10.1): пользовательский контент рендерится только
      // текстовыми узлами React (`{value}`); `dangerouslySetInnerHTML`
      // запрещён на уровне линта (задача 28.2, ChatPanel/VideoTile).
      'react/no-danger': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
];
