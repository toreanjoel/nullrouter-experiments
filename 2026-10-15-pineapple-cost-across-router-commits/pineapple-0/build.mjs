// Inlines src/ into one self-contained pineapple-0.html
import fs from 'fs';
const r = f => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const wgsl = r('shaders.wgsl');
if (/[`\\]|\$\{/.test(wgsl)) throw new Error('WGSL contains characters that break the template literal');
const html = r('page.html')
  .replace('/*SIM*/', () => r('sim.js') + '\n' + r('surface.js'))
  .replace('/*WGSL*/', () => wgsl)
  .replace('/*APP*/', () => r('gpu.js') + '\n' + r('app.js'));
fs.writeFileSync(new URL('./pineapple-0.html', import.meta.url), html);
console.log('pineapple-0.html', (html.length / 1024).toFixed(1), 'KB');
