#!/usr/bin/env node
/**
 * FIX-0033: verificación de versión en el deploy.
 *
 * El título del deploy en GitHub Actions es el asunto del commit. Si el asunto
 * no dice qué versión se publica, no hay forma de auditar qué hay en producción.
 * Este script falla el pipeline cuando:
 *   1. el asunto del commit no contiene `v<version de package.json>`;
 *   2. el README no muestra esa misma versión en el badge;
 *   3. (con --check-dist) el bundle construido no contiene la versión inyectada.
 *
 * Los commits de merge se omiten para no romper pushes de PRs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHECK_DIST = process.argv.includes('--check-dist');
const subjectIndex = process.argv.indexOf('--subject');
const subjectOverride = subjectIndex >= 0 ? (process.argv[subjectIndex + 1] ?? '') : null;
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const versionTag = `v${pkg.version}`;

const fail = (message) => {
  console.error(`\n❌ Versión: ${message}\n`);
  process.exit(1);
};

// 1) El asunto del commit debe declarar la versión que se despliega.
//    `--subject "..."` permite validar localmente antes de commitear.
const subject = subjectOverride !== null
  ? subjectOverride.trim()
  : execFileSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf-8' }).trim();
const isMergeCommit = subject.startsWith('Merge ');
if (isMergeCommit) {
  console.log(`⚠️  Commit de merge detectado, se omite el control del título: "${subject}"`);
} else if (!subject.includes(versionTag)) {
  fail(
    `el asunto del commit debe incluir "${versionTag}" (versión de package.json).\n` +
    `   Asunto actual: "${subject}"\n` +
    `   Ejemplo: "fix: resolve SDD-GL contract FIX-00XX <tema> (${versionTag})"`
  );
} else {
  console.log(`✔ Título del deploy: ${versionTag} declarada en "${subject}"`);
}

// 2) El README (documentación versionada) debe mostrar la misma versión.
const readme = readFileSync('README.md', 'utf-8');
if (!readme.includes(`versión-${pkg.version}-`)) {
  fail(`README.md no muestra el badge "versión-${pkg.version}". Actualizá el badge o la versión.`);
}
console.log(`✔ README sincronizado con ${versionTag}`);

// 3) Opcional (después del build): el bundle debe llevar la versión inyectada.
if (CHECK_DIST) {
  const assetsDir = join('dist', 'assets');
  if (!existsSync(assetsDir)) fail('no existe dist/assets; ejecutá `npm run build` antes de --check-dist.');

  const entry = readdirSync(assetsDir).find(file => file.startsWith('index-') && file.endsWith('.js'));
  if (!entry) fail('no se encontró el chunk principal `index-*.js` en dist/assets.');

  const bundle = readFileSync(join(assetsDir, entry), 'utf-8');
  if (!bundle.includes(pkg.version)) {
    fail(`dist/assets/${entry} no contiene "${pkg.version}": la versión no se inyectó en el build.`);
  }
  console.log(`✔ dist/assets/${entry} incluye ${pkg.version}`);
}

console.log(`\n✅ Versión consistente: ${versionTag}\n`);
