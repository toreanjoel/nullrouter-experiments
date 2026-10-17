// WebGPU device, buffers and size-dependent textures.
const G = { device: null, context: null, format: '', canvas: null, w: 0, h: 0, msaa: 4, buf: {}, tex: {}, view: {}, counts: {} };
const SHADOW_SIZE = 2048, HEIGHT_SIZE = 512;
const FU = new Float32Array(128);

async function gpuInit(canvas) {
  if (!navigator.gpu) return 'navigator.gpu is not available.';
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { adapter = null; }
  if (!adapter) return 'No GPU adapter was returned.';
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) return 'Could not get a WebGPU canvas context.';
  G.device = device; G.context = context; G.canvas = canvas;
  G.format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: G.format, alphaMode: 'opaque' });
  device.lost.then(info => { if (info.reason !== 'destroyed') showFallback('The GPU device was lost: ' + info.message); });
  return null;
}

function gpuBuffer(data, usage) {
  const b = G.device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUBufferUsage.COPY_DST });
  G.device.queue.writeBuffer(b, 0, data);
  return b;
}

function floorMesh() {
  const prof = [];
  for (let z = 12; z > -4; z -= 0.5) prof.push([z, 0, 0, 1, 0]);
  for (let i = 0; i <= 24; i++) {
    const p = -Math.PI / 2 - i / 24 * Math.PI / 2;
    prof.push([-4 + 4 * Math.cos(p), 4 + 4 * Math.sin(p), -Math.cos(p), -Math.sin(p)]);
  }
  for (let y = 5; y <= 20; y += 3) prof.push([-8, y, 1, 0]);
  const nx = 48, x0 = -16, x1 = 16, v = [], idx = [];
  for (const [z, y, nz, ny] of prof) {
    for (let i = 0; i <= nx; i++) v.push(x0 + (x1 - x0) * i / nx, y, z, 0, ny, nz);
  }
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) };
}

function sphereMesh(nu, nv) {
  const v = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const p = i / nu * Math.PI * 2;
      v.push(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) };
}

function gpuBuffers(mesh) {
  const U = GPUBufferUsage, B = G.buf;
  B.frame = G.device.createBuffer({ size: FU.byteLength, usage: U.UNIFORM | U.COPY_DST });
  B.surfDyn = G.device.createBuffer({ size: SKIN_DYN.byteLength, usage: U.VERTEX | U.COPY_DST });
  B.surfRest = gpuBuffer(SURF.attr, U.VERTEX);
  B.surfIdx = gpuBuffer(SURF.index, U.INDEX);
  G.counts.surf = SURF.index.length;
  const fl = floorMesh();
  B.floorV = gpuBuffer(fl.v, U.VERTEX); B.floorI = gpuBuffer(fl.i, U.INDEX); G.counts.floor = fl.i.length;
  const sp = sphereMesh(14, 9);
  B.sphereV = gpuBuffer(sp.v, U.VERTEX); B.sphereI = gpuBuffer(sp.i, U.INDEX); G.counts.sphere = sp.i.length;
  B.inst = G.device.createBuffer({ size: INST.byteLength, usage: U.VERTEX | U.COPY_DST });
  G.counts.inst = INCL.n;
  B.particles = G.device.createBuffer({ size: XR.byteLength, usage: U.VERTEX | U.COPY_DST });
  B.edges = gpuBuffer(mesh.edges, U.INDEX); G.counts.edges = mesh.edges.length;

  const T = GPUTextureUsage;
  G.tex.shadow = G.device.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  G.tex.height = G.device.createTexture({ size: [HEIGHT_SIZE, HEIGHT_SIZE], format: 'depth32float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  G.view.shadow = G.tex.shadow.createView(); G.view.height = G.tex.height.createView();
}

// (Re)creates the textures that follow the canvas size; returns true when they changed.
function gpuResize(w, h) {
  if (w === G.w && h === G.h && G.tex.msColor) return false;
  G.w = w; G.h = h;
  G.canvas.width = w; G.canvas.height = h;
  const T = GPUTextureUsage, d = G.device;
  for (const k of ['msColor', 'msDepth', 'scene', 'hdr', 'back', 'backDepth']) if (G.tex[k]) G.tex[k].destroy();
  G.tex.msColor = d.createTexture({ size: [w, h], sampleCount: G.msaa, format: 'rgba16float', usage: T.RENDER_ATTACHMENT });
  G.tex.msDepth = d.createTexture({ size: [w, h], sampleCount: G.msaa, format: 'depth32float', usage: T.RENDER_ATTACHMENT });
  G.tex.scene = d.createTexture({ size: [w, h], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  G.tex.hdr = d.createTexture({ size: [w, h], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  G.tex.back = d.createTexture({ size: [w, h], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  G.tex.backDepth = d.createTexture({ size: [w, h], format: 'depth32float', usage: T.RENDER_ATTACHMENT });
  for (const k of ['msColor', 'msDepth', 'scene', 'hdr', 'back', 'backDepth']) G.view[k] = G.tex[k].createView();
  return true;
}
