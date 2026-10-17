// Joins src/ into pineapple-3.html: WGSL as string constants, JS files in ORDER, CSS inline.
// Usage: node build.mjs [--emit-js path]   (--emit-js also writes the joined script for `node --check`)
import { readFileSync, writeFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('./src/' + p, import.meta.url), 'utf8');

const SHADERS = {
  WGSL_COMMON: 'shaders/common.wgsl',
  WGSL_SHADOW: 'shaders/shadow.wgsl',
  WGSL_HEIGHT: 'shaders/height.wgsl',
  WGSL_SCENE: 'shaders/scene.wgsl',
  WGSL_CELLS: 'shaders/cells.wgsl',
  WGSL_BACK: 'shaders/backdepth.wgsl',
  WGSL_JELLY: 'shaders/jelly.wgsl',
  WGSL_OVERLAY: 'shaders/overlay.wgsl',
  WGSL_TONEMAP: 'shaders/tonemap.wgsl',
};

const ORDER = [
  'core/params.js',
  'core/math.js',
  'geom/outline.js',
  'geom/delaunay.js',
  'geom/tets.js',
  'geom/embed.js',
  'geom/surface.js',
  'geom/inclusions.js',
  'phys/rotation.js',
  'phys/body.js',
  'phys/grab.js',
  'phys/xpbd.js',
  'phys/pick.js',
  'phys/actions.js',
  'gfx/camera.js',
  'gfx/gpu.js',
  'gfx/pass-shadow.js',
  'gfx/pass-height.js',
  'gfx/pass-scene.js',
  'gfx/pass-backdepth.js',
  'gfx/pass-overlay.js',
  'gfx/pass-jelly.js',
  'gfx/pass-tonemap.js',
  'gfx/frame.js',
  'ui/fallback.js',
  'ui/icons.js',
  'ui/panel.js',
  'ui/readouts.js',
  'ui/keys.js',
  'ui/input.js',
  'main.js',
];

let js = '';
for (const [name, file] of Object.entries(SHADERS)) js += `const ${name} = ${JSON.stringify(src(file))};\n`;
for (const f of ORDER) js += `// ---- ${f}\n${src(f)}\n`;

const html = src('shell.html')
  .replace('/*CSS*/', () => src('style.css'))
  .replace('/*JS*/', () => js);

writeFileSync(new URL('./pineapple-3.html', import.meta.url), html);
const i = process.argv.indexOf('--emit-js');
if (i > 0) writeFileSync(process.argv[i + 1], js);
console.log(`wrote pineapple-3.html (${html.length} bytes)`);
