// Exposure, Khronos PBR Neutral tone mapping, sRGB encode and a ±½ LSB dither.
//#include common

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var hdr: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn pbrNeutral(cin: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;
  let x = min(cin.r, min(cin.g, cin.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  var c = cin - offset;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) { return c; }
  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment
fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let c = textureLoad(hdr, vec2i(p.xy), 0).rgb * F.tintScatter.w;
  var o = toSrgb(clamp(pbrNeutral(max(c, vec3f(0.0))), vec3f(0.0), vec3f(1.0)));
  o += (ign(p.xy) - 0.5) / 255.0;
  return vec4f(o, 1.0);
}
