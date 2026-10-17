// Joins src/ (HTML template, CSS, JS modules, WGSL shaders) into one self-contained dist/pineapple-jelly.html.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const read = (p) => readFileSync(join(src, p), 'utf8');

const shaders = readdirSync(join(src, 'shaders')).filter((f) => f.endsWith('.wgsl')).sort();
const shaderJs = 'const WGSL = {\n' + shaders.map((f) =>
  `  ${basename(f, '.wgsl')}: ${JSON.stringify(read('shaders/' + f))},`).join('\n') + '\n};\n';

const modules = readdirSync(join(src, 'js')).filter((f) => f.endsWith('.js')).sort();
const js = '(() => {\n"use strict";\n' + shaderJs +
  modules.map((f) => `// ---- ${f}\n` + read('js/' + f)).join('\n') + '\n})();\n';

mkdirSync(join(root, 'dist'), { recursive: true });
const tmp = join(root, '.nullrouter', 'scratch', 'joined.js');
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, js);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });

const html = read('index.html')
  .replace('/*@CSS*/', () => read('style.css'))
  .replace('/*@JS*/', () => js);
writeFileSync(join(root, 'dist', 'pineapple-jelly.html'), html);
console.log(`built dist/pineapple-jelly.html (${(html.length / 1024).toFixed(1)} KB, ${modules.length} modules, ${shaders.length} shaders)`);
