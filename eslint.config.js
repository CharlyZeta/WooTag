// FIX-0022 — ESLint 9 (flat config). Sólo corrección, no formato:
// el formateo se difiere a un contrato propio para no enterrar la señal en un
// diff de 7k líneas. `npm run lint` debe terminar con 0 errores y 0 warnings.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'graphify-out/**',
      '.sdd/**',
      'contracts/**',
      'public/**',
      'screenshots/**',
      // Skills y scripts de terceros (Vercel, SDD-GL): no son código del producto.
      '.agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Lo esencial de React: hooks bien usados y dependencias completas.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // TypeScript ya valida variables globales y tipos.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Los bordes de API (WooCommerce/Firestore/SDK) usan `any` a propósito:
      // se documenta como excepción controlada en el contrato FIX-0022.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
