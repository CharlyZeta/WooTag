import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
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
