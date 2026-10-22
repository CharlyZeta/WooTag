import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(() => {
  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
      watch: {
        // FIX-0030: en Windows, `fs.watch` sobre un archivo bloqueado (una captura
        // recién escrita, un build en curso, el grafo) emite EBUSY y Vite lo trata
        // como fatal: se cae el dev server y la app "desaparece". Se excluyen los
        // directorios que no son código fuente.
        ignored: [
          '**/screenshots/**',
          '**/dist/**',
          '**/coverage/**',
          '**/graphify-out/**',
          '**/.sdd/**',
          '**/.git/**',
          '**/node_modules/**',
        ],
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(''),
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
      '__APP_VERSION__': JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xlsx')) return 'vendor-xlsx';
              if (id.includes('html5-qrcode')) return 'vendor-scanner';
              if (id.includes('lucide-react')) return 'vendor-icons';
              return 'vendor-react'; // React, React DOM, y demás libs base
            }
          }
        }
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['utils/**/*.ts', 'services/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.test.tsx'],
      },
    },
  };
});
