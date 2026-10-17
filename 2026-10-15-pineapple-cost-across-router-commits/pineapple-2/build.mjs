// Joins src/ (JS, WGSL, CSS, HTML shell) into the single file pineapple-jelly.html
import { readFileSync, writeFileSync } from 'node:fs';

const read = p => readFileSync(new URL('./src/' + p, import.meta.url), 'utf8');

const JS = [
  'math.js', 'outline.js', 'delaunay.js', 'tets.js', 'surface.js', 'inclusions.js',
  'sim.js', 'grab.js', 'actions.js', 'skin.js', 'camera.js', 'gpu.js', 'passes.js', 'ui.js', 'main.js',
];
const WGSL = ['common', 'studio', 'shadow', 'height', 'scene', 'cells', 'backface', 'jelly', 'overlay', 'tonemap'];

const shaders = 'const WGSL = {\n' +
  WGSL.map(n => `  ${n}: ${JSON.stringify(read('wgsl/' + n + '.wgsl'))},`).join('\n') + '\n};\n';
const js = '(() => {\n"use strict";\n' + shaders + JS.map(f => `// ${f}\n` + read('js/' + f)).join('\n') + '\n})();\n';

const html = read('index.html')
  .replace('/*CSS*/', () => read('style.css'))
  .replace('/*JS*/', () => js);

writeFileSync(new URL('./pineapple-jelly.html', import.meta.url), html);
console.log(`pineapple-jelly.html ${(html.length / 1024).toFixed(1)} KB`);
