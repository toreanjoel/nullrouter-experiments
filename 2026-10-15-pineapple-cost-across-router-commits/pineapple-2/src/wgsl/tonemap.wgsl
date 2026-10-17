@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var hdrTex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

// Khronos PBR Neutral.
fn neutral(c: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;
  let x = min(c.r, min(c.g, c.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  var col = c - offset;
  let peak = max(col.r, max(col.g, col.b));
  if (peak < startCompression) { return col; }
  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  col *= newPeak / peak;
  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(col, vec3f(newPeak), g);
}

fn srgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let hdr = max(textureLoad(hdrTex, vec2i(pos.xy), 0).rgb, vec3f(0.0)) * F.params.z;
  var c = srgb(clamp(neutral(hdr), vec3f(0.0), vec3f(1.0)));
  let n = hash21(pos.xy + fract(F.params.w * 0.618) * 97.0) + hash21(pos.yx * 1.31 + 11.0) - 1.0;
  c += n / 255.0;
  return vec4f(c, 1.0);
}
