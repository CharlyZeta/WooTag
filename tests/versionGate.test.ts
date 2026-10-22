import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0033: cada deploy debe declarar en su título la versión que publica.
 *
 * El título del run en GitHub Actions es el asunto del commit, así que el gate
 * verifica ese asunto contra `package.json`, el badge del README y (después del
 * build) la versión inyectada en el bundle.
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

describe('FIX-0033 — versión en el título del deploy', () => {
  it('FIX-0033-AC-001: existe el script y está expuesto en package.json', () => {
    expect(existsSync(join(ROOT, 'scripts', 'verify-version.mjs'))).toBe(true);
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:version']).toBe('node scripts/verify-version.mjs');
  });

  it('FIX-0033-AC-001: el script exige la versión en el asunto y revisa README y bundle', () => {
    const script = read('scripts/verify-version.mjs');
    expect(script, 'el gate debe leer el asunto del commit con git log').toContain('git');
    expect(script).toContain("'log'");
    expect(script).toContain('versionTag');
    expect(script).toContain('versión-');
    expect(script).toMatch(/--check-dist/);
    // Los merges no bloquean el deploy.
    expect(script).toContain("startsWith('Merge ')");
  });

  it('FIX-0033-AC-002: el workflow corre el gate antes de los tests y revisa el bundle antes del FTP', () => {
    const workflow = read('.github/workflows/deploy.yml');
    const verifyBefore = workflow.indexOf('verify:version\n');
    const tests = workflow.indexOf('npm run test');
    const build = workflow.indexOf('npm run build');
    const verifyDist = workflow.indexOf('--check-dist');
    const deploy = workflow.indexOf('FTP-Deploy-Action');

    expect(verifyBefore).toBeGreaterThan(-1);
    expect(verifyBefore).toBeLessThan(tests);
    expect(verifyDist).toBeGreaterThan(build);
    expect(verifyDist).toBeLessThan(deploy);
  });

  it('FIX-0033-AC-002: la versión de package.json está en el badge del README', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(read('README.md')).toContain(`versión-${pkg.version}-`);
  });
});
