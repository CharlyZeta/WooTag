/**
 * tests/firestoreRules.test.ts — Guardas estáticas de FIX-0017
 *
 * Verifica que las reglas de Firestore están versionadas, que sólo permiten al
 * dueño su propio documento y subcolecciones, que el resto queda denegado por
 * defecto, y que la documentación describe el cifrado como lo que es
 * (ofuscación en reposo) sin exigir migración de los datos existentes.
 *
 * ── LÍMITE DE ESTA VERIFICACIÓN (declarado, no oculto) ──────────────────────
 * El proyecto NO tiene emulador de Firestore ni `firebase-tools`, así que las
 * reglas no se pueden *ejecutar* en un test. Lo que se verifica aquí es
 * **análisis estático sobre el texto de `firestore.rules`**: se parsean los
 * bloques `match` / `function`, se extraen las sentencias `allow` y se comprueba
 * su condición. La semántica del lenguaje de reglas (por ejemplo que `=**` es
 * recursivo) se asume por especificación, no se simula. La verificación
 * *dinámica* con dos cuentas vive en el checklist manual del README (AC-001).
 *
 * Criterios cubiertos:
 *   AC-001 — `firestore.rules` versionado con `rules_version '2'`, `firebase.json`
 *            que lo referencia, README con comando de despliegue y checklist de
 *            dos cuentas.
 *   AC-002 — `read`/`write` sobre `users/{userId}` y su subcolección recursiva
 *            exigen `request.auth.uid == userId` (directo o vía función
 *            verificada), deny por defecto para el resto y ningún `allow … if true`.
 *   AC-003 — README y `utils/crypto.ts` describen el cifrado como ofuscación en
 *            reposo y nombran a las reglas como el control real.
 *   AC-004 — Sin migración: el formato `enc:v1:…` y el uso de `uid` como secreto
 *            siguen igual, y las reglas cubren `snapshots`.
 *
 * No usa DOM: sólo `node:fs`. No importa ningún módulo de la aplicación.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

/** Lee un archivo del repositorio; falla con un mensaje claro si no existe o está vacío. */
function requireRepoFile(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Falta el archivo requerido: ${relativePath} (raíz: ${ROOT})`);
  }
  const content = readFileSync(fullPath, 'utf-8');
  if (content.trim() === '') {
    throw new Error(`El archivo requerido está vacío: ${relativePath}`);
  }
  return content;
}

// ─── Mini-parser del lenguaje de reglas de Firestore ────────────────────────
// Sólo lo necesario para este archivo: comentarios, literales de texto, llaves
// balanceadas, bloques `service`/`match`/`function` y sentencias terminadas en `;`.

interface RulesStatement {
  readonly text: string;
  readonly depth: number;
  readonly start: number;
  readonly end: number;
}

interface RulesBlock {
  readonly kind: 'service' | 'match' | 'function';
  readonly header: string;
  /** Ruta normalizada del matcher (sólo `match`), p. ej. `/users/{userId}`. */
  readonly path: string | null;
  readonly name: string | null;
  readonly params: readonly string[];
  readonly depth: number;
  readonly start: number;
  readonly open: number;
  readonly close: number;
  readonly body: string;
}

interface ParsedRules {
  readonly blocks: readonly RulesBlock[];
  readonly statements: readonly RulesStatement[];
  readonly balanced: boolean;
}

const WILDCARD_PREFIX = '__wc__';
const WILDCARD_SUFFIX = '__';

const RECURSIVE_MATCHER_PATH = /^\/\{[A-Za-z_][A-Za-z0-9_]*=\*\*\}$/;
const USERS_MATCHER_PATH = /^\/users\/\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const WILDCARD_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RECURSIVE_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*=\*\*$/;

function skipString(source: string, quoteIndex: number): number {
  const quote = source[quoteIndex];
  let i = quoteIndex + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipLineComment(source: string, commentIndex: number): number {
  let i = commentIndex;
  while (i < source.length && source[i] !== '\n') i += 1;
  return i;
}

/** Sustituye comentarios y literales por espacios conservando los offsets. */
function stripNonCode(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const end = skipLineComment(source, i);
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = skipString(source, i);
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Enmascara los comodines de ruta (`{userId}`, `{document=**}`) para que las
 * llaves de los mismos no se confundan con las de apertura de bloque.
 */
function maskPathWildcards(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      if (!/\bmatch\s/.test(line)) return line;
      return line.replace(/\{([^}]*)\}/g, (whole: string, inner: string) => {
        const isWildcard = WILDCARD_TOKEN.test(inner) || RECURSIVE_TOKEN.test(inner);
        return isWildcard ? `${WILDCARD_PREFIX}${inner}${WILDCARD_SUFFIX}` : whole;
      });
    })
    .join('\n');
}

function unmaskPath(path: string): string {
  return path.replace(/__wc__(.+?)__/g, '{$1}');
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      i = skipString(source, i) - 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i = skipLineComment(source, i) - 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function countBraces(source: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  for (const ch of source) {
    if (ch === '{') open += 1;
    else if (ch === '}') close += 1;
  }
  return { open, close };
}

/** Parsea las reglas en bloques anidados y sentencias, con su profundidad. */
function parseRules(rawSource: string): ParsedRules {
  const source = maskPathWildcards(stripNonCode(rawSource));
  const blocks: RulesBlock[] = [];
  const statements: RulesStatement[] = [];

  const parseLevel = (from: number, to: number, depth: number): void => {
    let i = from;
    let statementStart = from;
    while (i < to) {
      const ch = source[i];
      if (ch === ';') {
        const text = source.slice(statementStart, i).trim();
        if (text !== '') statements.push({ text, depth, start: statementStart, end: i + 1 });
        i += 1;
        statementStart = i;
        continue;
      }
      if (ch === '{') {
        const rawHeader = source.slice(statementStart, i);
        const header = rawHeader.trim();
        const close = findMatchingBrace(source, i);
        if (close === -1 || close > to) {
          throw new Error(`Llave sin cerrar en la posición ${i} del archivo de reglas`);
        }
        const leadingSpaces = rawHeader.length - rawHeader.trimStart().length;
        const start = statementStart + leadingSpaces;
        const body = source.slice(i + 1, close);

        if (/^service\b/.test(header)) {
          blocks.push({ kind: 'service', header, path: null, name: null, params: [], depth, start, open: i, close, body });
        } else if (/^match\b/.test(header)) {
          const path = unmaskPath(header.replace(/^match\s+/, ''));
          blocks.push({ kind: 'match', header, path, name: null, params: [], depth, start, open: i, close, body });
        } else if (/^function\b/.test(header)) {
          const fn = header.match(/^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)$/);
          if (fn === null) throw new Error(`Cabecera de función no reconocida: "${header}"`);
          const params = fn[2]
            .split(',')
            .map((param) => param.trim())
            .filter((param) => param !== '');
          blocks.push({ kind: 'function', header, path: null, name: fn[1], params, depth, start, open: i, close, body });
        } else {
          throw new Error(`Bloque no reconocido en el archivo de reglas: "${header}"`);
        }

        parseLevel(i + 1, close, depth + 1);
        i = close + 1;
        statementStart = i;
        continue;
      }
      if (ch === '}') {
        throw new Error(`Llave de cierre inesperada en la posición ${i} del archivo de reglas`);
      }
      i += 1;
    }
    const trailing = source.slice(statementStart, to).trim();
    if (trailing !== '') statements.push({ text: trailing, depth, start: statementStart, end: to });
  };

  parseLevel(0, source.length, 0);

  const braces = countBraces(source);
  return { blocks, statements, balanced: braces.open === braces.close };
}

/** Sentencias `allow` / `match` declaradas directamente dentro de un bloque. */
function directStatements(rules: ParsedRules, block: RulesBlock): RulesStatement[] {
  return rules.statements.filter(
    (statement) =>
      statement.depth === block.depth + 1 && statement.start > block.open && statement.end <= block.close
  );
}

function directAllows(rules: ParsedRules, block: RulesBlock): Array<{ permissions: string[]; condition: string }> {
  return directStatements(rules, block)
    .filter((statement) => /^allow\b/.test(statement.text))
    .map((statement) => parseAllow(statement.text));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Descompone `allow read, write: if <condición>` en permisos + condición. */
function parseAllow(statement: string): { permissions: string[]; condition: string } {
  const match = statement.match(/^allow\s+([A-Za-z,\s]+?)\s*:\s*if\s+([\s\S]+)$/);
  if (match === null) {
    throw new Error(`Sentencia allow no reconocida (¿le falta la condición "if"?): "${statement}"`);
  }
  return {
    permissions: match[1]
      .split(',')
      .map((permission) => permission.trim())
      .filter((permission) => permission !== ''),
    condition: normalizeWhitespace(match[2]),
  };
}

/** ¿La condición es exactamente la comparación inline de dueño? */
function hasInlineOwnerCheck(condition: string, ownerParam: string): boolean {
  return (
    condition === `request.auth.uid == ${ownerParam}` ||
    condition === `request.auth != null && request.auth.uid == ${ownerParam}`
  );
}

/** Nombre de la función invocada si la condición es `fn(ownerParam)`. */
function ownerFunctionName(condition: string, ownerParam: string): string | null {
  const call = condition.match(/^([A-Za-z_][A-Za-z0-9_]*)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/);
  if (call === null || call[2] !== ownerParam) return null;
  return call[1];
}

/** Verifica el cuerpo de la función de dueño: debe retornar exactamente la comparación. */
function functionReturnsOwnerCheck(rules: ParsedRules, functionName: string, ownerParam: string): boolean {
  const fn = rules.blocks.find((block) => block.kind === 'function' && block.name === functionName);
  if (fn === undefined) return false;
  if (!fn.params.includes(ownerParam)) return false;
  const body = normalizeWhitespace(fn.body);
  return (
    body === `return request.auth != null && request.auth.uid == ${ownerParam};` ||
    body === `return request.auth.uid == ${ownerParam};`
  );
}

/**
 * Exige que la condición sea una guarda de dueño real: comparación inline, o
 * llamada a una función definida cuyo cuerpo retorna esa misma comparación.
 * Cualquier condición más débil (p. ej. sólo `request.auth != null`) falla.
 */
function assertOwnerGuard(condition: string, ownerParam: string, rules: ParsedRules, where: string): void {
  if (hasInlineOwnerCheck(condition, ownerParam)) return;

  const functionName = ownerFunctionName(condition, ownerParam);
  expect(
    functionName,
    `${where}: la condición "${condition}" no compara request.auth.uid con ${ownerParam}`
  ).not.toBeNull();
  expect(
    functionReturnsOwnerCheck(rules, functionName as string, ownerParam),
    `${where}: la función ${String(functionName)} no retorna exactamente "request.auth.uid == ${ownerParam}" con request.auth != null`
  ).toBe(true);
}

/** Localiza el matcher `/users/{userId}` y devuelve el nombre del parámetro. */
function findUsersMatcher(rules: ParsedRules): { block: RulesBlock; ownerParam: string } {
  const matches = rules.blocks.filter(
    (block) => block.kind === 'match' && block.path !== null && USERS_MATCHER_PATH.test(block.path)
  );
  expect(matches.length, 'debe existir exactamente un matcher /users/{userId} en firestore.rules').toBe(1);
  const block = matches[0];
  const pathMatch = (block.path as string).match(USERS_MATCHER_PATH) as RegExpMatchArray;
  return { block, ownerParam: pathMatch[1] };
}

/** Bloques `match` anidados dentro de otro bloque. */
function nestedMatches(rules: ParsedRules, parent: RulesBlock): RulesBlock[] {
  return rules.blocks.filter(
    (block) => block.kind === 'match' && block.start > parent.open && block.close < parent.close
  );
}

// ─── Helpers de Markdown ────────────────────────────────────────────────────

/** Extrae la sección Markdown de nivel 2 (`## …`) que arranca en `heading`. */
function h2Section(markdown: string, heading: RegExp): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s/.test(line) && heading.test(line));
  if (start === -1) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Extrae la sección Markdown (nivel 2 o 3) cuyo **encabezado** matchea `heading`.
 * Se exige la marca `##`/`###`: si no, una fila de tabla que nombre el tema
 * (p. ej. "…reglas de Firestore versionadas…") se confundiría con la sección.
 */
function markdownSection(markdown: string, heading: RegExp): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{2,3}\s/.test(line) && heading.test(line));
  if (start === -1) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,3}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// ─── PRECONDICIÓN: la raíz resuelta es la del repositorio ───────────────────

describe('FIX-0017 precondición — la raíz del repo se resuelve correctamente', () => {
  it('FIX-0017-root: la raíz contiene package.json, App.tsx y firestore.rules', () => {
    expect(existsSync(join(ROOT, 'package.json'))).toBe(true);
    expect(existsSync(join(ROOT, 'App.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'firestore.rules'))).toBe(true);
  });
});

// ─── AC-001 ─────────────────────────────────────────────────────────────────

describe('FIX-0017 AC-001 — reglas de Firestore versionadas y desplegables', () => {
  it("FIX-0017-ac001: firestore.rules existe, empieza con rules_version = '2' y declara service cloud.firestore", () => {
    const rulesSource = requireRepoFile('firestore.rules');

    expect(rulesSource.length).toBeGreaterThan(0);

    // La versión 2 es requisito duro del contrato y debe ser lo primero del archivo.
    expect(rulesSource.replace(/^\uFEFF/, '').trimStart()).toMatch(/^rules_version\s*=\s*'2'\s*;/);

    const rules = parseRules(rulesSource);
    const services = rules.blocks.filter((block) => block.kind === 'service');
    expect(
      services.map((service) => normalizeWhitespace(service.header)),
      'firestore.rules debe declarar el bloque "service cloud.firestore"'
    ).toContain('service cloud.firestore');

    // Y el matcher raíz de base de datos, que es donde viven las colecciones.
    expect(
      rules.blocks.some((block) => block.kind === 'match' && block.path === '/databases/{database}/documents'),
      'firestore.rules debe tener el matcher /databases/{database}/documents'
    ).toBe(true);
  });

  it('FIX-0017-ac001: firebase.json referencia firestore.rules y el archivo referenciado existe', () => {
    const firebaseJsonSource = requireRepoFile('firebase.json');
    const parsed = JSON.parse(firebaseJsonSource) as { firestore?: { rules?: unknown } };

    expect(Object.prototype.hasOwnProperty.call(parsed, 'firestore'), 'firebase.json debe tener la clave "firestore"').toBe(true);
    expect(parsed.firestore, 'firebase.json: "firestore" debe ser un objeto').toBeTypeOf('object');
    expect(parsed.firestore?.rules, 'firebase.json: firestore.rules debe ser "firestore.rules"').toBe('firestore.rules');

    // Referencia real, no un nombre decorativo: el archivo apuntado existe y es el analizado.
    const referencedPath = join(ROOT, String(parsed.firestore?.rules));
    expect(existsSync(referencedPath)).toBe(true);
    expect(readFileSync(referencedPath, 'utf-8')).toBe(requireRepoFile('firestore.rules'));
  });

  it('FIX-0017-ac001: el README documenta el comando de despliegue de reglas (firebase … deploy --only firestore:rules)', () => {
    const readme = requireRepoFile('README.md');
    const section = markdownSection(readme, /reglas\s+de\s+firestore/i);

    expect(section, 'el README debe tener una sección "🔐 Reglas de Firestore"').not.toBe('');
    expect(section).toMatch(/firebase/i);
    expect(section, 'el README debe mostrar el comando de despliegue de reglas').toMatch(
      /deploy\s+--only\s+firestore:rules/
    );
    // Nombrar el archivo de reglas en la sección de despliegue (auditable).
    expect(section).toMatch(/firestore\.rules/);
  });

  it('FIX-0017-ac001: el README incluye un checklist de verificación con dos cuentas (A y B)', () => {
    const readme = requireRepoFile('README.md');
    const section = markdownSection(readme, /reglas\s+de\s+firestore/i);

    expect(section).toMatch(/checklist/i);

    const checklist = section.slice(section.search(/checklist/i));
    const mentionsTwoAccounts = /dos\s+cuentas/i.test(checklist);
    const mentionsAccountA = /cuenta\s+\*{0,2}A\b/.test(checklist);
    const mentionsAccountB = /cuenta\s+\*{0,2}B\b/.test(checklist) || /\bA\s+y\s+B\b/.test(checklist);
    const numberedItems = checklist.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+\S/.test(line)).length;

    // AC-001: dos cuentas identificadas, o al menos 4 pasos numerados de verificación.
    const twoAccountChecklist = mentionsTwoAccounts && mentionsAccountA && mentionsAccountB;
    expect(
      twoAccountChecklist || numberedItems >= 4,
      `checklist insuficiente: dosCuentas=${mentionsTwoAccounts} cuentaA=${mentionsAccountA} cuentaB=${mentionsAccountB} pasosNumerados=${numberedItems}`
    ).toBe(true);

    // Anti-vacuidad: si se declara el checklist con dos cuentas, no puede estar vacío.
    expect(checklist.trim().length).toBeGreaterThan(80);
  });
});

// ─── AC-002 ─────────────────────────────────────────────────────────────────

describe('FIX-0017 AC-002 — sólo el dueño lee/escribe su documento, todo lo demás denegado', () => {
  it('FIX-0017-ac002: el matcher /users/{userId} permite read y write sólo bajo guarda de dueño', () => {
    const rulesSource = requireRepoFile('firestore.rules');
    const rules = parseRules(rulesSource);
    const { block, ownerParam } = findUsersMatcher(rules);

    expect(ownerParam, 'el parámetro del matcher debe ser el usado en la condición').toBe('userId');

    // El bloque debe vivir dentro del matcher raíz de base de datos.
    const documentsMatcher = rules.blocks.find(
      (candidate) => candidate.kind === 'match' && candidate.path === '/databases/{database}/documents'
    );
    expect(documentsMatcher, 'falta el matcher /databases/{database}/documents').toBeDefined();
    expect(block.open > (documentsMatcher as RulesBlock).open).toBe(true);
    expect(block.close < (documentsMatcher as RulesBlock).close).toBe(true);

    const allows = directAllows(rules, block);
    expect(allows.length, 'el matcher /users/{userId} debe tener al menos una sentencia allow').toBeGreaterThanOrEqual(1);

    const readWriteAllows = allows.filter(
      (allow) => allow.permissions.includes('read') && allow.permissions.includes('write')
    );
    expect(
      readWriteAllows.length,
      'debe haber un allow que cubra read y write sobre users/{userId}'
    ).toBeGreaterThanOrEqual(1);

    // Cada allow del bloque (incluidos los adicionales) exige la guarda de dueño.
    for (const allow of allows) {
      expect(
        allow.permissions.every((permission) => permission === 'read' || permission === 'write'),
        `permiso inesperado en ${ownerParam}: ${allow.permissions.join(', ')}`
      ).toBe(true);
      assertOwnerGuard(allow.condition, ownerParam, rules, 'matcher /users/{userId}');
    }
  });

  it('FIX-0017-ac002: el matcher recursivo /{document=**} dentro de users/{userId} usa la misma guarda (cubre snapshots/{siteId})', () => {
    const rules = parseRules(requireRepoFile('firestore.rules'));
    const { block, ownerParam } = findUsersMatcher(rules);

    const recursiveMatchers = nestedMatches(rules, block).filter(
      (candidate) => candidate.path !== null && RECURSIVE_MATCHER_PATH.test(candidate.path)
    );
    expect(
      recursiveMatchers.length,
      'users/{userId} debe contener un matcher recursivo /{document=**} para las subcolecciones'
    ).toBe(1);

    const recursive = recursiveMatchers[0];
    // Un matcher `=**` cubre cualquier descendiente: `snapshots/{siteId}` incluido.
    expect(recursive.path).toBe('/{document=**}');

    const allows = directAllows(rules, recursive);
    expect(allows.length).toBeGreaterThanOrEqual(1);
    expect(
      allows.some((allow) => allow.permissions.includes('read') && allow.permissions.includes('write')),
      'la subcolección debe permitir read y write bajo la guarda de dueño'
    ).toBe(true);

    for (const allow of allows) {
      assertOwnerGuard(allow.condition, ownerParam, rules, 'matcher recursivo /{document=**} de users');
    }
  });

  it('FIX-0017-ac002: existe un deny por defecto match /{document=**} con allow read, write: if false', () => {
    const rules = parseRules(requireRepoFile('firestore.rules'));
    const { block: usersBlock } = findUsersMatcher(rules);

    const recursiveMatchers = rules.blocks.filter(
      (candidate) => candidate.kind === 'match' && candidate.path !== null && RECURSIVE_MATCHER_PATH.test(candidate.path)
    );

    const denyBlocks = recursiveMatchers.filter((candidate) =>
      directAllows(rules, candidate).some((allow) => allow.condition === 'false')
    );
    expect(denyBlocks.length, 'debe existir un matcher recursivo con allow … if false').toBeGreaterThanOrEqual(1);

    // El deny por defecto es hermano del matcher de users, no una regla anidada en él.
    const defaultDeny = denyBlocks[denyBlocks.length - 1];
    const isInsideUsers = defaultDeny.start > usersBlock.open && defaultDeny.close < usersBlock.close;
    expect(isInsideUsers, 'el deny por defecto no debe estar anidado dentro de users/{userId}').toBe(false);

    const denyAllows = directAllows(rules, defaultDeny);
    const denyReadWrite = denyAllows.find((allow) => allow.condition === 'false');
    expect(denyReadWrite, 'el deny por defecto debe cubrir al menos read y write').toBeDefined();
    expect(
      [...(denyReadWrite as { permissions: string[] }).permissions].sort(),
      'el deny por defecto debe denegar read y write'
    ).toEqual(['read', 'write']);
    expect(denyAllows.every((allow) => allow.condition === 'false')).toBe(true);

    // Y el deny por defecto cubre el contenedor de base de datos (todas las rutas).
    const documentsMatcher = rules.blocks.find(
      (candidate) => candidate.kind === 'match' && candidate.path === '/databases/{database}/documents'
    );
    expect(documentsMatcher, 'falta el matcher /databases/{database}/documents').toBeDefined();
    expect(defaultDeny.open > (documentsMatcher as RulesBlock).open).toBe(true);
    expect(defaultDeny.close < (documentsMatcher as RulesBlock).close).toBe(true);
  });

  it('FIX-0017-ac002: no hay ningún allow … if true ni allow read público en firestore.rules', () => {
    const rulesSource = requireRepoFile('firestore.rules');

    // Directo sobre el texto (cubre también las formas que el parser no tocaría).
    expect(rulesSource, 'ninguna regla puede tener la condición "true"').not.toMatch(
      /\ballow\b[^;]*\bif\s+true\b/i
    );
    expect(rulesSource, 'no puede haber un allow read público').not.toMatch(
      /allow\s+read\b[^;]*\bif\s+true\b/i
    );

    // Y a nivel semántico: toda sentencia allow parseada tiene condición y no es `true`.
    const rules = parseRules(rulesSource);
    const allowStatements = rules.statements.filter((statement) => /^allow\b/.test(statement.text));
    expect(allowStatements.length, 'firestore.rules debe tener reglas allow').toBeGreaterThanOrEqual(3);
    for (const statement of allowStatements) {
      const parsed = parseAllow(statement.text);
      expect(parsed.condition, `allow sin condición real: "${normalizeWhitespace(statement.text)}"`).not.toBe('');
      expect(parsed.condition, `allow abierto prohibido: "${normalizeWhitespace(statement.text)}"`).not.toBe('true');
    }
  });

  it('FIX-0017-ac002: las llaves de firestore.rules están balanceadas', () => {
    const rulesSource = requireRepoFile('firestore.rules');
    const rules = parseRules(rulesSource); // lanza si hay un cierre inesperado o un bloque sin cerrar

    const braces = countBraces(stripNonCode(rulesSource));
    expect(braces.open, 'el archivo de reglas debe abrir al menos un bloque').toBeGreaterThan(0);
    expect(braces.close, `llaves desbalanceadas: ${braces.open} aperturas vs ${braces.close} cierres`).toBe(
      braces.open
    );
    expect(rules.balanced, 'el parser debe confirmar el balanceo de llaves').toBe(true);

    // El bloque `service` debe ser el último en cerrarse (no quedan bloques abiertos).
    const service = rules.blocks.find((block) => block.kind === 'service');
    expect(service).toBeDefined();
    expect(stripNonCode(rulesSource).trimEnd().endsWith('}')).toBe(true);
  });
});

// ─── AC-003 ─────────────────────────────────────────────────────────────────

describe('FIX-0017 AC-003 — documentación honesta del modelo de amenaza', () => {
  it('FIX-0017-ac003: el README describe el cifrado como ofuscación en reposo y nombra firestore.rules como el control real', () => {
    const readme = requireRepoFile('README.md');
    const securitySection = h2Section(readme, /seguridad/i);

    expect(securitySection, 'el README debe tener una sección de seguridad').not.toBe('');
    expect(securitySection, 'la sección de seguridad debe hablar de ofuscación').toMatch(/ofuscaci[óo]n/i);
    expect(securitySection, 'la sección de seguridad debe nombrar firestore.rules').toMatch(/firestore\.rules/);
    expect(securitySection, 'la sección de seguridad debe nombrar el control real').toMatch(/control\s+real/i);
  });

  it('FIX-0017-ac003: ni el README ni utils/crypto.ts afirman que el cifrado protege las credenciales', () => {
    const readme = requireRepoFile('README.md');
    const cryptoSource = requireRepoFile('utils/crypto.ts');

    for (const [label, content] of [
      ['README.md', readme],
      ['utils/crypto.ts', cryptoSource],
    ] as const) {
      expect(content, `${label} no puede afirmar que "protege credenciales"`).not.toMatch(/protege\s+credenciales/i);
      expect(content, `${label} no puede hablar de "cifrado protector"`).not.toMatch(/cifrado\s+protector/i);
    }
  });

  it('FIX-0017-ac003: la cabecera de utils/crypto.ts documenta el límite del uid y que las reglas son el control real', () => {
    const cryptoSource = requireRepoFile('utils/crypto.ts');
    const header = cryptoSource.match(/^\s*\/\*\*([\s\S]*?)\*\//);

    expect(header, 'utils/crypto.ts debe empezar con un bloque de documentación de cabecera').not.toBeNull();
    const headerText = (header as RegExpMatchArray)[1];

    // El límite: la clave deriva de algo que viaja en el path del documento.
    expect(headerText, 'la cabecera debe nombrar el uid como límite del cifrado').toMatch(/\buid\b/);
    expect(headerText, 'la cabecera debe negar la confidencialidad').toMatch(/no\s+aporta\s+confidencialidad/i);
    expect(headerText, 'la cabecera debe nombrar el control real').toMatch(/control\s+real/i);
    expect(headerText, 'la cabecera debe remitir a firestore.rules').toMatch(/firestore\.rules/);
    // Y sigue nombrando la ofuscación (coherente con el README).
    expect(headerText).toMatch(/ofuscaci[óo]n/i);
  });
});

// ─── AC-004 ─────────────────────────────────────────────────────────────────

describe('FIX-0017 AC-004 — sin migración: el formato enc:v1: y el esquema no cambian', () => {
  it('FIX-0017-ac004: utils/crypto.ts sigue emitiendo y aceptando el prefijo enc:v1:', () => {
    const cryptoSource = requireRepoFile('utils/crypto.ts');

    expect(cryptoSource, 'el prefijo enc:v1: debe seguir presente').toMatch(/enc:v1:/);
    // Emisión real: el valor de retorno de encryptSecret se construye con ese prefijo.
    expect(cryptoSource, "encryptSecret debe seguir emitiendo `enc:v1:${…}`").toMatch(/return\s+`enc:v1:\$\{/);
    // Aceptación real: el camino de descifrado reconoce el prefijo (compatibilidad con datos existentes).
    expect(cryptoSource, "decryptSecret debe seguir comprobando startsWith('enc:v1:')").toMatch(
      /startsWith\(\s*'enc:v1:'\s*\)/
    );
    // Y el separador de 5 partes del formato no cambia.
    expect(cryptoSource).toMatch(/parts\.length\s*!==\s*5/);
  });

  it('FIX-0017-ac004: services/cloudProfiles.ts sigue importando y llamando encryptSecret/decryptSecret con el uid', () => {
    const cloudProfiles = requireRepoFile('services/cloudProfiles.ts');

    expect(cloudProfiles, 'el import de utils/crypto debe seguir ahí').toMatch(
      /import\s*\{[^}]*\bencryptSecret\b[^}]*\bdecryptSecret\b[^}]*\}\s*from\s*['"]\.\.\/utils\/crypto['"]/
    );

    const encryptWithUid = cloudProfiles.match(/encryptSecret\([^)]*,\s*uid\s*\)/g) ?? [];
    const decryptWithUid = cloudProfiles.match(/decryptSecret\([^)]*,\s*uid\s*\)/g) ?? [];
    expect(encryptWithUid.length, 'debe haber al menos un encryptSecret(<secreto>, uid)').toBeGreaterThanOrEqual(1);
    expect(decryptWithUid.length, 'debe haber al menos un decryptSecret(<secreto>, uid)').toBeGreaterThanOrEqual(1);

    // Sin migración: el documento sigue siendo users/{uid} y no hay lógica de re-cifrado.
    expect(cloudProfiles).toMatch(/doc\(\s*db\s*,\s*['"]users['"]\s*,\s*uid\s*\)/);
    expect(cloudProfiles, 'no debe introducirse una migración de formato').not.toMatch(
      /migrat|reencrypt|re-encrypt/i
    );
  });

  it('FIX-0017-ac004: firestore.rules cubre la subcolección snapshots vía el matcher recursivo de users', () => {
    const rules = parseRules(requireRepoFile('firestore.rules'));
    const { block, ownerParam } = findUsersMatcher(rules);

    const recursiveMatchers = nestedMatches(rules, block).filter(
      (candidate) => candidate.path !== null && RECURSIVE_MATCHER_PATH.test(candidate.path)
    );
    expect(
      recursiveMatchers.length,
      'la subcolección snapshots sólo puede habilitarse a través del matcher recursivo de users'
    ).toBe(1);

    // `users/{uid}/snapshots/{siteId}` es descendiente directo del matcher `=**`:
    // cubierto por la misma guarda de dueño, sin ruta adicional ni migración.
    const allows = directAllows(rules, recursiveMatchers[0]);
    expect(allows.length).toBeGreaterThanOrEqual(1);
    for (const allow of allows) {
      assertOwnerGuard(allow.condition, ownerParam, rules, 'subcolección snapshots/{siteId}');
    }

    // Y no existe un matcher explícito de snapshots que pudiera contradecir la guarda.
    const explicitSnapshots = rules.blocks.filter(
      (candidate) => candidate.kind === 'match' && candidate.path !== null && /snapshots/.test(candidate.path)
    );
    expect(
      explicitSnapshots.length,
      'no debe haber un matcher explícito de snapshots además del recursivo'
    ).toBe(0);
  });
});

// ─── Guarda de integridad del propio archivo de reglas ──────────────────────

describe('FIX-0017 guarda — el archivo de reglas no queda vacío de guardas', () => {
  it('FIX-0017-guard: firestore.rules tiene al menos 3 allow y el deny por defecto va después del matcher de users', () => {
    const rulesSource = requireRepoFile('firestore.rules');
    const rules = parseRules(rulesSource);

    const allowCount = (rulesSource.match(/\ballow\s+/g) ?? []).length;
    expect(allowCount, 'un archivo de reglas sin allow no protege nada (¿se vació?)').toBeGreaterThanOrEqual(3);

    const { block: usersBlock } = findUsersMatcher(rules);
    const defaultDeny = rules.blocks.find((candidate) => {
      if (candidate.kind !== 'match' || candidate.path === null) return false;
      if (!RECURSIVE_MATCHER_PATH.test(candidate.path)) return false;
      const insideUsers = candidate.start > usersBlock.open && candidate.close < usersBlock.close;
      if (insideUsers) return false;
      return directAllows(rules, candidate).some((allow) => allow.condition === 'false');
    });
    expect(defaultDeny, 'debe existir el deny por defecto fuera del matcher de users').toBeDefined();

    // Orden explícito: una edición futura no puede mover el deny antes (denegaría todo).
    expect(
      (defaultDeny as RulesBlock).start,
      'el deny por defecto debe declararse después del matcher /users/{userId}'
    ).toBeGreaterThan(usersBlock.start);

    // Y ambos son hermanos: viven al mismo nivel, dentro del matcher de base de datos.
    expect(
      (defaultDeny as RulesBlock).depth,
      'el deny por defecto debe ser hermano del matcher /users/{userId}, no colgar de él'
    ).toBe(usersBlock.depth);
  });
});
