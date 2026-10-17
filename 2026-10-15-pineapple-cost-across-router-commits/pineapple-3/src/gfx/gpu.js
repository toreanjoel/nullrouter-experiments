// WebGPU device, shared buffers, render targets and samplers.
const HDR_FORMAT = 'rgba16float', MSAA = 4, SHADOW_SIZE = 1024, HEIGHT_SIZE = 256;
const UNIFORM_FLOATS = 104;
const SURF_POS_LAYOUT = { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] };
const SURF_FULL_LAYOUT = [
  { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
  { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }] },
];

const G = {
  ready: false, device: null, ctx: null, format: '', canvas: null, w: 1, h: 1,
  uData: new Float32Array(UNIFORM_FLOATS), ubuf: null,
  surfVB: null, surfRestVB: null, surfIB: null, surfCount: 0,
  physVB: null, edgeIB: null, edgeCount: 0,
  sphereVB: null, sphereIB: null, sphereCount: 0, instVB: null, instCount: 0,
  linSamp: null, tex: {}, view: {},
};

async function gpuInit(canvas) {
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return false;
  const device = await adapter.requestDevice();
  G.device = device;
  G.canvas = canvas;
  G.ctx = canvas.getContext('webgpu');
  if (!G.ctx) return false;
  G.format = navigator.gpu.getPreferredCanvasFormat();
  G.ctx.configure({ device, format: G.format, alphaMode: 'opaque' });
  device.lost.then((info) => { G.ready = false; if (info.reason !== 'destroyed') showFallback('The graphics device was lost.'); });
  device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', e.error.message));
  G.ubuf = device.createBuffer({ size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  G.linSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  makeTarget('shThick', SHADOW_SIZE, SHADOW_SIZE, 'r16float', 1);
  makeTarget('shDepth', SHADOW_SIZE, SHADOW_SIZE, 'r16float', 1);
  makeTarget('height', HEIGHT_SIZE, HEIGHT_SIZE, 'r16float', 1);
  return true;
}

function makeModule(code) {
  return G.device.createShaderModule({ code: WGSL_COMMON + '\n' + code });
}

function uniformGroup(pipe) {
  return G.device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: G.ubuf } }] });
}

function makeTarget(name, w, h, format, samples, sampled = true) {
  if (G.tex[name]) G.tex[name].destroy();
  let usage = GPUTextureUsage.RENDER_ATTACHMENT;
  if (sampled && samples === 1) usage |= GPUTextureUsage.TEXTURE_BINDING;
  G.tex[name] = G.device.createTexture({ size: [w, h], format, sampleCount: samples, usage });
  G.view[name] = G.tex[name].createView();
}

function gpuResize(w, h) {
  G.w = w; G.h = h;
  makeTarget('msaaColor', w, h, HDR_FORMAT, MSAA);
  makeTarget('msaaDepth', w, h, 'depth24plus', MSAA);
  makeTarget('scene', w, h, HDR_FORMAT, 1);
  makeTarget('hdr', w, h, HDR_FORMAT, 1);
  makeTarget('back', w, h, 'r16float', 1);
  makeTarget('backDepth', w, h, 'depth24plus', 1, false);
}

function makeBuffer(data, usage) {
  const buf = G.device.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST });
  G.device.queue.writeBuffer(buf, 0, data);
  return buf;
}

// Unit UV sphere for juice cells and bubbles.
function makeSphere(lat, lon) {
  const pos = [], idx = [];
  for (let i = 0; i <= lat; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / lat;
    for (let j = 0; j <= lon; j++) {
      const lam = (2 * Math.PI * j) / lon;
      pos.push(Math.cos(phi) * Math.cos(lam), Math.sin(phi), Math.cos(phi) * Math.sin(lam));
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j, b = a + lon + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

function gpuCreateMeshBuffers(B, S, inc) {
  const V = GPUBufferUsage.VERTEX, I = GPUBufferUsage.INDEX;
  G.surfVB = makeBuffer(S.vbuf, V);
  G.surfRestVB = makeBuffer(S.rest, V);
  G.surfIB = makeBuffer(S.tris, I);
  G.surfCount = S.ntri * 3;
  G.physVB = makeBuffer(B.x, V);
  G.edgeIB = makeBuffer(Uint32Array.from(B.edges), I);
  G.edgeCount = B.ne * 2;
  const sph = makeSphere(8, 12);
  G.sphereVB = makeBuffer(sph.pos, V);
  G.sphereIB = makeBuffer(sph.idx, I);
  G.sphereCount = sph.idx.length;
  G.instVB = makeBuffer(inc.inst, V);
  G.instCount = inc.n;
}
