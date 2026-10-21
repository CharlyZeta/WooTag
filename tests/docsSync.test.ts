import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

/**
 * FIX-0027: la documentación versionada no puede quedar atrás del código.
 *
 * Verifica los tres invariantes que se desincronizaron:
 *  1. versión y cantidad de tests del README coinciden con `package.json` y la suite real;
 *  2. `ENGINEERING_CONTEXT.md` ya no afirma que la API key de Gemini se inyecta en el build;
 *  3. la tabla de estructura lista todos los archivos de la app.
 */

const findRepoRoot = (start: string): string => {
  let current = start;
  for (let i = 0; i < 10; i++) {
    try {
      statSync(join(current, 'package.json'));
      statSync(join(current, 'App.tsx'));
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
const rel = (file: string) => relative(ROOT, file).replace(/\\/g, '/');

const APP_DIRS = ['components', 'services', 'utils', 'contexts'];
const APP_ROOT_FILES = ['App.tsx', 'index.tsx', 'types.ts', 'vite.config.ts', 'firestore.rules', 'firebase.json'];

const collectAppFiles = (): string[] => {
  const files: string[] = APP_ROOT_FILES.map(f => join(ROOT, f)).filter(p => existsSync(p));
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) files.push(full);
    }
  };
  for (const dir of APP_DIRS) {
    const full = join(ROOT, dir);
    if (existsSync(full)) walk(full);
  }
  return files;
};

const collectTestFiles = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && entry !== '.git' && entry !== 'dist') walk(full);
      } else if (/\.test\.(ts|tsx)$/.test(entry)) {
        files.push(full);
      }
    }
  };
  walk(ROOT);
  return files;
};

describe('FIX-0027 — documentación sincronizada con el código', () => {
  it('FIX-0027-AC-001: la versión del README coincide con package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const readme = read('README.md');
    expect(readme).toContain(`versión-${pkg.version}-`);
    expect(readme).not.toContain('versión-2.2.0');
  });

  it('FIX-0027-AC-001: la cantidad de tests documentada coincide con la suite real', () => {
    const readme = read('README.md');
    const testFiles = collectTestFiles();
    const totalTests = testFiles.reduce((acc, file) => {
      const content = readFileSync(file, 'utf-8');
      return acc + (content.match(/^\s*it\(/gm) ?? []).length;
    }, 0);

    expect(testFiles.length).toBeGreaterThan(20);
    expect(totalTests).toBeGreaterThan(200);

    const badge = readme.match(/tests-(\d+)%20passing/);
    expect(badge, 'el README debe declarar el badge de tests').not.toBeNull();
    expect(Number(badge![1])).toBe(totalTests);

    // Y el detalle por grupo debe declarar la misma cantidad de archivos.
    expect(readme).toContain(`${testFiles.length} archivos`);
  });

  it('FIX-0027-AC-001: el README no conserva números ni archivos obsoletos', () => {
    const readme = read('README.md');
    expect(readme).not.toContain('97 tests');
    expect(readme).not.toContain('2.2.0');
    expect(readme).not.toContain('ipLogger');
    expect(readme).not.toContain('Modo Companion');
  });

  it('FIX-0027-AC-002: ENGINEERING_CONTEXT no afirma que la key de Gemini viaja en el build', () => {
    const contextPath = join(ROOT, 'ENGINEERING_CONTEXT.md');
    if (!existsSync(contextPath)) return; // archivo local y gitignoreado: puede no estar
    const context = readFileSync(contextPath, 'utf-8');
    expect(context).not.toMatch(/(GEMINI_API_KEY|API_KEY)[^\n]*se inyecta en build time/i);
    expect(context).toMatch(/BYOK/i);
    expect(context).not.toContain('97 tests');
    expect(context).not.toContain('2.2.7');
  });

  it('FIX-0027-AC-003: la tabla de estructura lista todos los archivos de la app', () => {
    const readme = read('README.md');
    const missing = collectAppFiles()
      .filter(file => !readme.includes(rel(file).split('/').pop() as string))
      .map(rel);
    expect(missing).toEqual([]);
  });

  it('FIX-0027-AC-003: la estructura no lista archivos que ya no existen', () => {
    const readme = read('README.md');
    const listed = ['ipLogger.ts', 'HostRoomModal.tsx', 'MobileJoinScanner.tsx', 'realtimeSession.ts'];
    const stillListed = listed.filter(name => readme.includes(name));
    expect(stillListed).toEqual([]);
  });
});
