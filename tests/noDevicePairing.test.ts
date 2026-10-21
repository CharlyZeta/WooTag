/**
 * tests/noDevicePairing.test.ts — Guardas estructurales de FIX-0012
 *
 * Verifica que el emparejamiento por QR de invitados (modo "Companion") fue
 * retirado de forma completa y que el único camino de alta cross-device que
 * queda es la cuenta cloud (`users/{uid}`).
 *
 * Criterios cubiertos:
 *   AC-001 — Cero símbolos del flujo de salas en código, tests y documentación
 *            vigente (README.md, ENGINEERING_CONTEXT.md, memory.md).
 *            `contracts/`, `.sdd/runs/`, `changelog.txt` y `graphify-out/` son
 *            registros históricos y NO se escanean.
 *   AC-003 — Seam: App.tsx sigue llamando a `addProductToCloudProfile` y no
 *            referencia ninguna API de salas.
 *   AC-004 — README: sin "Companion" / "Vincular celular" / "QR de sesión";
 *            el modo móvil se documenta como "requiere cuenta".
 *   AC-005 — `services/realtimeSession.ts` y su test ya no existen.
 *
 * No usa DOM: sólo `node:fs`. No importa ningún módulo de la aplicación.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// ─── Raíz del repositorio ────────────────────────────────────────────────────
// `import.meta.url` no es fiable bajo el transform de Vite (no siempre es un
// file URL), así que se sube desde el cwd buscando los marcadores del repo.

function findRepoRoot(start: string): string {
  let current = resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'App.tsx'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`No se pudo localizar la raíz del repositorio desde ${start}`);
}

const ROOT = findRepoRoot(process.cwd());

// ─── Símbolos prohibidos (AC-001) ────────────────────────────────────────────

const FORBIDDEN_ROOM_SYMBOLS = [
  'HostRoomModal',
  'MobileJoinScanner',
  'realtimeSession',
  'createRoom',
  'joinRoom',
  'subscribeToRoom',
  'syncRoomProducts',
  'addProductToRoom',
  'closeRoom',
  'activeRoomId',
  'roomRole',
] as const;

// ─── Helpers de descubrimiento de archivos ───────────────────────────────────

/** Normaliza a rutas relativas estilo POSIX para que los diffs sean legibles. */
const rel = (absPath: string): string => relative(ROOT, absPath).replace(/\\/g, '/');

/** Recorre un directorio acumulando archivos de código (.ts/.tsx/.js/.jsx). */
function walkCodeFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCodeFiles(full, out);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

interface ScannedFile {
  path: string;
  content: string;
}

/**
 * Archivos que deben quedar fuera del escaneo por nombrar los símbolos
 * prohibidos *a propósito*, como parte de las propias guardas de FIX-0012.
 * Cualquier otro archivo con estos símbolos es una violación de AC-001.
 */
const GUARD_FILES_EXCLUDED_FROM_SCAN = [
  'tests/noDevicePairing.test.ts',
  'components/ImportTab.noCompanion.test.tsx',
];

/**
 * Construye el corpus de AC-001: `App.tsx`, `components/**`, `services/*.ts`,
 * más el resto del código vigente (`contexts/`, `utils/`, `types.ts`,
 * `index.tsx`) y la documentación viva. Nunca incluye `contracts/`, `.sdd/`,
 * `changelog.txt`, `graphify-out/`, `coverage/` ni `dist/`, que son registros
 * históricos o artefactos de build.
 */
function collectAc001Targets(): ScannedFile[] {
  const absolutePaths: string[] = [];

  const rootCodeFiles = ['App.tsx', 'types.ts', 'index.tsx'];
  for (const name of rootCodeFiles) {
    const full = join(ROOT, name);
    if (existsSync(full)) absolutePaths.push(full);
  }

  for (const dir of ['components', 'services', 'contexts', 'utils']) {
    walkCodeFiles(join(ROOT, dir), absolutePaths);
  }

  const docFiles = ['README.md', 'ENGINEERING_CONTEXT.md', 'memory.md'];
  for (const name of docFiles) {
    const full = join(ROOT, name);
    if (existsSync(full)) absolutePaths.push(full);
  }

  return absolutePaths
    .filter((absPath) => !GUARD_FILES_EXCLUDED_FROM_SCAN.includes(rel(absPath)))
    .map((absPath) => ({
      path: rel(absPath),
      content: readFileSync(absPath, 'utf-8'),
    }));
}

/** Devuelve los pares archivo/símbolo que violan AC-001. */
function findForbiddenSymbols(files: ScannedFile[], symbols: readonly string[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    for (const symbol of symbols) {
      if (file.content.includes(symbol)) {
        violations.push(`${file.path} contiene "${symbol}"`);
      }
    }
  }
  return violations;
}

/** Extrae la sección Markdown que arranca en el heading que matchea `heading`. */
function markdownSection(markdown: string, heading: RegExp): { title: string; body: string } {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return { title: '', body: '' };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,3}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { title: lines[start], body: lines.slice(start, end).join('\n') };
}

// ─── AC-001 ──────────────────────────────────────────────────────────────────

describe('FIX-0012 AC-001 — no queda superficie de salas por QR', () => {
  it('FIX-0012-AC-001: el código y la documentación vigente no contienen ningún símbolo del flujo de salas', () => {
    const files = collectAc001Targets();

    // Anti-vacuidad: el corpus debe existir y ser el esperado.
    expect(files.length).toBeGreaterThanOrEqual(20);
    const scanned = files.map((f) => f.path);
    for (const required of [
      'App.tsx',
      'components/Controls.tsx',
      'components/controls/ImportTab.tsx',
      'services/cloudProfiles.ts',
      'README.md',
    ]) {
      expect(scanned).toContain(required);
    }

    // Los registros históricos quedan fuera del escaneo por diseño (AC-001).
    expect(scanned.some((p) => p.startsWith('contracts/'))).toBe(false);
    expect(scanned.some((p) => p.startsWith('.sdd/'))).toBe(false);
    expect(scanned).not.toContain('changelog.txt');
    expect(scanned.some((p) => p.startsWith('graphify-out/'))).toBe(false);

    // Las únicas exclusiones admitidas son las guardas de este contrato, y
    // deben existir realmente (si no, la exclusión sería un agujero silencioso).
    for (const guard of GUARD_FILES_EXCLUDED_FROM_SCAN) {
      expect(existsSync(join(ROOT, guard))).toBe(true);
      expect(scanned).not.toContain(guard);
    }

    expect(findForbiddenSymbols(files, FORBIDDEN_ROOM_SYMBOLS)).toEqual([]);
  });
});

// ─── AC-005 ──────────────────────────────────────────────────────────────────

describe('FIX-0012 AC-005 — el módulo de salas y su test fueron eliminados', () => {
  it('FIX-0012-AC-005: services/realtimeSession.ts y services/realtimeSession.test.ts no existen', () => {
    // Anti-vacuidad: la raíz resuelve al repo real, así que un path mal armado
    // no puede hacer pasar este test por accidente.
    expect(existsSync(join(ROOT, 'services', 'cloudProfiles.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'package.json'))).toBe(true);

    expect(existsSync(join(ROOT, 'services', 'realtimeSession.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'services', 'realtimeSession.test.ts'))).toBe(false);
  });
});

// ─── AC-004 ──────────────────────────────────────────────────────────────────

describe('FIX-0012 AC-004 — el README deja de prometer emparejamiento por QR', () => {
  const readmePath = join(ROOT, 'README.md');

  it('FIX-0012-AC-004: el README no menciona Companion, "Vincular celular" ni QR de sesión/invitado', () => {
    expect(existsSync(readmePath)).toBe(true);
    const readme = readFileSync(readmePath, 'utf-8');

    expect(readme).not.toMatch(/companion/i);
    expect(readme).not.toMatch(/vincular\s+celular/i);
    expect(readme).not.toMatch(/qr\s+de\s+(sesi[óo]n|invitado)/i);
    expect(readme).not.toMatch(/empareja/i);
  });

  it('FIX-0012-AC-004: el README documenta el Modo Móvil como "requiere cuenta" e indica iniciar sesión', () => {
    const readme = readFileSync(readmePath, 'utf-8');

    // El modo móvil sigue existiendo y sigue siendo alcanzable por #/mobile.
    expect(readme).toMatch(/modo\s+m[óo]vil/i);
    expect(readme).toContain('#/mobile');

    // Y la sección de móvil aclara explícitamente que se requiere cuenta/sesión.
    const { title, body } = markdownSection(readme, /modo\s+m[óo]vil/i);
    expect(title).not.toBe('');
    expect(body).toMatch(/requiere\s+cuenta/i);
    expect(body).toMatch(/cuenta/i);
    expect(body).toMatch(/inici[áa]\s+sesi[óo]n|iniciar\s+sesi[óo]n/i);
  });
});

// ─── AC-003 ──────────────────────────────────────────────────────────────────

describe('FIX-0012 AC-003 — el único camino cross-device es el perfil cloud', () => {
  const appPath = join(ROOT, 'App.tsx');
  const cloudProfilesPath = join(ROOT, 'services', 'cloudProfiles.ts');

  it('FIX-0012-AC-003: App.tsx sigue dando de alta productos vía addProductToCloudProfile(currentUser.uid, …)', () => {
    const app = readFileSync(appPath, 'utf-8');

    // Importa y usa el alta atómica del perfil cloud.
    expect(app).toMatch(
      /import\s*\{[^}]*\baddProductToCloudProfile\b[^}]*\}\s*from\s*['"]\.\/services\/cloudProfiles['"]/
    );
    expect(app).toMatch(/addProductToCloudProfile\(\s*currentUser\.uid/);
  });

  it('FIX-0012-AC-003: App.tsx no referencia ninguna API de salas ni la colección rooms', () => {
    const app = readFileSync(appPath, 'utf-8');

    expect(findForbiddenSymbols([{ path: 'App.tsx', content: app }], FORBIDDEN_ROOM_SYMBOLS)).toEqual([]);
    // "room" no debe aparecer en absoluto en el orquestador de estado.
    expect(app).not.toMatch(/\broom/i);
  });

  it('FIX-0012-AC-003: el perfil cloud persiste en la colección users/{uid} y no en rooms', () => {
    expect(existsSync(cloudProfilesPath)).toBe(true);
    const cloudProfiles = readFileSync(cloudProfilesPath, 'utf-8');

    expect(cloudProfiles).toMatch(/export\s+const\s+addProductToCloudProfile\s*=/);
    expect(cloudProfiles).toMatch(/doc\(\s*db\s*,\s*['"]users['"]\s*,/);
    expect(cloudProfiles).not.toMatch(/['"]rooms['"]/);
  });
});
