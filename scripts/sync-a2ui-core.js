// Copia el núcleo de Norte A2UI (packages/a2ui-schema/src/core) a la app móvil.
//
// La app no está en los workspaces de npm (Metro no resuelve symlinks del
// monorepo sin configuración extra y el bundle nativo se construye aparte),
// así que el runtime se lleva como copia. El núcleo no tiene dependencias y es
// idéntico al que sirve la API a la web en /a2ui/*.js. Un test en
// packages/a2ui-schema falla si la copia se desincroniza.
//
//   node scripts/sync-a2ui-core.js          # copia
//   node scripts/sync-a2ui-core.js --check  # solo verifica (exit 1 si difiere)

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = path.join(root, 'packages', 'a2ui-schema', 'src', 'core');
export const TARGET_DIR = path.join(root, 'apps', 'mobile', 'src', 'a2ui', 'core');

const HEADER = '// GENERADO por scripts/sync-a2ui-core.js a partir de packages/a2ui-schema/src/core. No editar aquí.\n';

export function coreFiles() {
  return readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.js')).sort();
}

export function expectedContent(name) {
  return HEADER + readFileSync(path.join(SOURCE_DIR, name), 'utf8');
}

// El fin de línea no es parte del contenido: con core.autocrlf=true (Windows)
// git entrega CRLF y el HEADER se escribe con LF, así que comparar byte a byte
// marcaba los nueve archivos como desincronizados aunque fueran idénticos. Un
// guard que siempre grita es un guard que nadie lee.
const normalize = (text) => text.replace(/\r\n/g, '\n');

export function diffs() {
  const out = [];
  for (const name of coreFiles()) {
    let current = null;
    try {
      current = readFileSync(path.join(TARGET_DIR, name), 'utf8');
    } catch {
      current = null;
    }
    if (current === null || normalize(current) !== normalize(expectedContent(name))) out.push(name);
  }
  return out;
}

export function sync() {
  mkdirSync(TARGET_DIR, { recursive: true });
  for (const name of coreFiles()) writeFileSync(path.join(TARGET_DIR, name), expectedContent(name));
  return coreFiles();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = diffs();
    if (stale.length) {
      console.error(`[a2ui] la copia móvil del núcleo está desactualizada: ${stale.join(', ')}. Corre: npm run sync:a2ui`);
      process.exit(1);
    }
    console.log('[a2ui] la copia móvil del núcleo está al día.');
  } else {
    console.log(`[a2ui] copiados: ${sync().join(', ')}`);
  }
}
