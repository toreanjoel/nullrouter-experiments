// WebGPU device and canvas setup, buffer and shader helpers, and the size-dependent render targets.
const GPU = { device: null, context: null, format: 'bgra8unorm', canvas: null, width: 0, height: 0, t: {}, v: {} };
const MSAA = 4;
const HDR = 'rgba16float';

async function initGPU(canvas) {
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return false;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) return false;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  device.addEventListener('uncapturederror', e => console.error('WebGPU:', e.error.message));
  Object.assign(GPU, { device, context, format, canvas });
  return true;
}

function gpuBuffer(data, usage, label) {
  const size = Math.max(16, Math.ceil(data.byteLength / 4) * 4);
  const buf = GPU.device.createBuffer({ label, size, usage: usage | GPUBufferUsage.COPY_DST });
  GPU.device.queue.writeBuffer(buf, 0, data);
  return buf;
}

function gpuEmpty(size, usage, label) {
  return GPU.device.createBuffer({ label, size: Math.max(16, size), usage: usage | GPUBufferUsage.COPY_DST });
}

function shaderModule(name) {
  const mod = GPU.device.createShaderModule({ label: name, code: SHADERS[name] });
  mod.getCompilationInfo().then(info => {
    for (const m of info.messages) {
      if (m.type === 'error') console.error(`[${name}.wgsl] ${m.lineNum}:${m.linePos} ${m.message}`);
    }
  });
  return mod;
}

// Recreates the screen-sized targets when the canvas size changes; returns true if it did.
function resizeTargets() {
  const c = GPU.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  const maxPx = 2.6e6;
  if (w * h > maxPx) { const s = Math.sqrt(maxPx / (w * h)); w = Math.round(w * s); h = Math.round(h * s); }
  if (w === GPU.width && h === GPU.height) return false;
  c.width = w; c.height = h; GPU.width = w; GPU.height = h;
  for (const k in GPU.t) GPU.t[k].destroy();
  const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
  const tex = (format, sampleCount, usage) => GPU.device.createTexture({ size: [w, h], format, sampleCount, usage });
  GPU.t = {
    sceneMS: tex(HDR, MSAA, RA), scene: tex(HDR, 1, RA | TB), depthMS: tex('depth24plus', MSAA, RA),
    back: tex(HDR, 1, RA | TB), backDepth: tex('depth24plus', 1, RA),
    jellyMS: tex(HDR, MSAA, RA), hdr: tex(HDR, 1, RA | TB),
  };
  GPU.v = {};
  for (const k in GPU.t) GPU.v[k] = GPU.t[k].createView();
  return true;
}
