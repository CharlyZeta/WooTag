import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0021: el JSX debe estar tipado y el proyecto compilar en `strict`.
 *
 * Los 1.615 errores que aparecían con `--strict` eran casi todos un artefacto de
 * no tener `@types/react` (JSX sin tipo → `any` implícito). Este guard evita que
 * alguien apague `strict` o quite los tipos en el futuro.
 */

const findRepoRoot = (start: string): string => {
  let current = start;
  for (let i = 0; i < 10; i++) {
    try {
      readFileSync(join(current, 'package.json'));
      readFileSync(join(current, 'App.tsx'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('No se encontró la raíz del repositorio');
};

const ROOT = findRepoRoot(process.cwd());
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
  devDependencies: Record<string, string>;
};
const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8')) as {
  compilerOptions: Record<string, unknown>;
};

describe('FIX-0021 — JSX tipado y TypeScript estricto', () => {
  it('FIX-0021-AC-001: @types/react y @types/react-dom están en devDependencies (línea 19)', () => {
    expect(pkg.devDependencies['@types/react']).toMatch(/^\^?19\./);
    expect(pkg.devDependencies['@types/react-dom']).toMatch(/^\^?19\./);
  });

  it('FIX-0021-AC-002: tsconfig tiene strict activado y JSX con react-jsx', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
  });

  it('FIX-0021-AC-002: tsconfig no desactiva ninguna comprobación de strict', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8');
    expect(raw).not.toMatch(/"strict"\s*:\s*false/);
    expect(raw).not.toMatch(/"strictNullChecks"\s*:\s*false/);
    expect(raw).not.toMatch(/"noImplicitAny"\s*:\s*false/);
  });
});
