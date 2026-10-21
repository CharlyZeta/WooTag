import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0022: el lint debe existir, cubrir el código del producto y bloquear el deploy.
 *
 * El valor real está en `react-hooks/exhaustive-deps` y en detectar imports/vars
 * muertos: por eso se verifica que la configuración no quede vacía ni desactivada.
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
const read = (file: string) => readFileSync(join(ROOT, file), 'utf-8');

describe('FIX-0022 — ESLint configurado y bloqueante en CI', () => {
  it('FIX-0022-AC-001: existe eslint.config.js y excluye el código de terceros (.agents)', () => {
    expect(existsSync(join(ROOT, 'eslint.config.js'))).toBe(true);
    const config = read('eslint.config.js');
    expect(config).toContain('.agents/**');
    expect(config).toContain('react-hooks/exhaustive-deps');
    expect(config).toContain('@typescript-eslint/no-unused-vars');
  });

  it('FIX-0022-AC-001: las reglas de hooks están como error (no warn/off)', () => {
    const config = read('eslint.config.js');
    expect(config).toMatch(/'react-hooks\/rules-of-hooks':\s*'error'/);
    expect(config).toMatch(/'react-hooks\/exhaustive-deps':\s*'error'/);
    expect(config).not.toMatch(/'react-hooks\/exhaustive-deps':\s*'off'/);
  });

  it('FIX-0022-AC-003: package.json expone los scripts lint y lint:fix', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toBe('eslint .');
    expect(pkg.scripts['lint:fix']).toBe('eslint . --fix');
  });

  it('FIX-0022-AC-002: el workflow corre lint después del typecheck y antes del build', () => {
    const workflow = read('.github/workflows/deploy.yml');
    const lintIndex = workflow.indexOf('npm run lint');
    const buildIndex = workflow.indexOf('npm run build');
    const typecheckIndex = workflow.indexOf('npm run typecheck');

    expect(lintIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(typecheckIndex).toBeGreaterThan(-1);
    expect(lintIndex).toBeLessThan(buildIndex);
    expect(lintIndex).toBeGreaterThan(typecheckIndex);
  });
});
